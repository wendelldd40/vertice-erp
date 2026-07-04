-- ============================================================
-- VÉRTICE ERP — Migration 006: Clientes (CRM) + Fotos de produtos
-- Kanban de relacionamento, vínculo venda↔cliente e
-- Supabase Storage com política por empresa. Execute APÓS a 005.
-- ============================================================

-- ---------- CLIENTES ----------
create table if not exists public.clientes (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas(id) on delete cascade,
  nome         text not null,
  tipo         text not null default 'pf' check (tipo in ('pf','pj')),
  cpf_cnpj     text,
  email        text,
  telefone     text,
  aniversario  date,
  cep          text,
  endereco     text,
  cidade       text,
  uf           text,
  observacoes  text,
  etapa        text not null default 'lead'
               check (etapa in ('lead','contato','negociacao','cliente','inativo')),
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

drop trigger if exists trg_clientes_touch on public.clientes;
create trigger trg_clientes_touch before update on public.clientes
  for each row execute function public.touch_atualizado_em();

-- ---------- VÍNCULO VENDA ↔ CLIENTE ----------
alter table public.vendas
  add column if not exists cliente_id uuid references public.clientes(id) on delete set null;

create index if not exists idx_vendas_cliente on public.vendas (cliente_id);

-- ---------- FOTO DE PRODUTO ----------
alter table public.produtos
  add column if not exists imagem_url text;

-- ---------- registrar_venda: agora aceita cliente_id ----------
drop function if exists public.registrar_venda(jsonb, text, numeric, numeric, text);

create or replace function public.registrar_venda(
  p_itens jsonb,
  p_forma_pagamento text,
  p_desconto numeric default 0,
  p_valor_recebido numeric default null,
  p_cliente_nome text default null,
  p_cliente_id uuid default null
)
returns table (venda_id uuid, numero bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_empresa uuid := public.empresa_do_usuario();
  v_numero bigint;
  v_venda uuid;
  v_deposito uuid;
  v_item jsonb;
  v_produto uuid;
  v_qtd numeric;
  v_preco numeric;
  v_subtotal numeric := 0;
  v_total numeric;
  v_troco numeric := null;
  v_saldo numeric;
  v_nome text;
  v_cliente_nome text := nullif(trim(coalesce(p_cliente_nome, '')), '');
begin
  if v_empresa is null then raise exception 'Sem empresa'; end if;
  if not public.tem_permissao('vendas', 'criar') then
    raise exception 'Sem permissão para registrar vendas';
  end if;
  if p_forma_pagamento not in ('dinheiro','pix','debito','credito') then
    raise exception 'Forma de pagamento inválida';
  end if;
  if jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) = 0 then
    raise exception 'A venda precisa ter ao menos um item';
  end if;
  if coalesce(p_desconto, 0) < 0 then raise exception 'Desconto inválido'; end if;

  -- Cliente vinculado: valida e usa o nome do cadastro (snapshot)
  if p_cliente_id is not null then
    select nome into v_cliente_nome from public.clientes
     where id = p_cliente_id and empresa_id = v_empresa;
    if not found then raise exception 'Cliente inválido'; end if;
  end if;

  update public.empresas
     set proximo_numero_venda = proximo_numero_venda + 1
   where id = v_empresa
  returning proximo_numero_venda - 1 into v_numero;

  select id into v_deposito from public.depositos
   where empresa_id = v_empresa and padrao = true limit 1;
  if v_deposito is null then
    select id into v_deposito from public.depositos where empresa_id = v_empresa limit 1;
  end if;
  if v_deposito is null then raise exception 'Nenhum depósito cadastrado'; end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_produto := (v_item->>'produto_id')::uuid;
    v_qtd := (v_item->>'quantidade')::numeric;
    v_preco := (v_item->>'preco_unitario')::numeric;
    if v_qtd is null or v_qtd <= 0 then raise exception 'Quantidade inválida'; end if;
    if v_preco is null or v_preco < 0 then raise exception 'Preço inválido'; end if;
    perform 1 from public.produtos where id = v_produto and empresa_id = v_empresa and ativo = true;
    if not found then raise exception 'Produto inválido ou inativo'; end if;
    v_subtotal := v_subtotal + (v_qtd * v_preco);
  end loop;

  v_total := greatest(v_subtotal - coalesce(p_desconto, 0), 0);

  if p_forma_pagamento = 'dinheiro' then
    if p_valor_recebido is null or p_valor_recebido < v_total then
      raise exception 'Valor recebido menor que o total';
    end if;
    v_troco := p_valor_recebido - v_total;
  end if;

  insert into public.vendas
    (empresa_id, numero, cliente_id, cliente_nome, subtotal, desconto, total,
     forma_pagamento, valor_recebido, troco, vendedor_id)
  values
    (v_empresa, v_numero, p_cliente_id, v_cliente_nome, v_subtotal,
     coalesce(p_desconto, 0), v_total, p_forma_pagamento, p_valor_recebido, v_troco, auth.uid())
  returning id into v_venda;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_produto := (v_item->>'produto_id')::uuid;
    v_qtd := (v_item->>'quantidade')::numeric;
    v_preco := (v_item->>'preco_unitario')::numeric;

    select nome into v_nome from public.produtos where id = v_produto;

    insert into public.venda_itens
      (empresa_id, venda_id, produto_id, produto_nome, quantidade, preco_unitario, total)
    values (v_empresa, v_venda, v_produto, v_nome, v_qtd, v_preco, v_qtd * v_preco);

    insert into public.estoque_saldos (empresa_id, produto_id, deposito_id)
    values (v_empresa, v_produto, v_deposito)
    on conflict (produto_id, deposito_id) do nothing;

    select quantidade into v_saldo from public.estoque_saldos
     where produto_id = v_produto and deposito_id = v_deposito for update;

    if v_saldo < v_qtd then
      raise exception 'Estoque insuficiente de "%" (disponível: %)', v_nome, v_saldo;
    end if;

    update public.estoque_saldos
       set quantidade = quantidade - v_qtd
     where produto_id = v_produto and deposito_id = v_deposito;

    insert into public.estoque_movimentacoes
      (empresa_id, produto_id, deposito_id, tipo, quantidade, motivo, usuario_id)
    values
      (v_empresa, v_produto, v_deposito, 'saida', -v_qtd, 'Venda #' || v_numero, auth.uid());
  end loop;

  return query select v_venda, v_numero;
end $$;

-- ---------- RPC: resumo do cliente (KPIs em 1 viagem) ----------
create or replace function public.cliente_resumo(p_cliente uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_empresa uuid := public.empresa_do_usuario();
  v jsonb;
begin
  if not public.tem_permissao('clientes', 'ver') then
    raise exception 'Sem permissão';
  end if;
  select jsonb_build_object(
    'total_gasto', coalesce(sum(total), 0),
    'qtd_compras', count(*),
    'ticket_medio', coalesce(avg(total), 0),
    'ultima_compra', max(criado_em)
  ) into v
  from public.vendas
  where empresa_id = v_empresa and cliente_id = p_cliente and status = 'concluida';
  return v;
end $$;

-- ---------- RLS clientes ----------
alter table public.clientes enable row level security;

create policy "cli_select" on public.clientes for select
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('clientes','ver'));
create policy "cli_insert" on public.clientes for insert
  with check (empresa_id = public.empresa_do_usuario() and public.tem_permissao('clientes','criar'));
create policy "cli_update" on public.clientes for update
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('clientes','editar'));
create policy "cli_delete" on public.clientes for delete
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('clientes','excluir'));

create index if not exists idx_clientes_empresa on public.clientes (empresa_id, etapa);
create index if not exists idx_clientes_nome on public.clientes (empresa_id, nome);

-- ============================================================
-- STORAGE: bucket de fotos de produtos
-- Leitura pública (URL vai direto no <img>), escrita só na
-- pasta da própria empresa: {empresa_id}/{arquivo}
-- ============================================================
insert into storage.buckets (id, name, public)
values ('produtos', 'produtos', true)
on conflict (id) do nothing;

drop policy if exists "prod_img_select" on storage.objects;
create policy "prod_img_select" on storage.objects for select
  using (bucket_id = 'produtos');

drop policy if exists "prod_img_insert" on storage.objects;
create policy "prod_img_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'produtos'
    and (storage.foldername(name))[1] = public.empresa_do_usuario()::text
    and public.tem_permissao('produtos','editar')
  );

drop policy if exists "prod_img_delete" on storage.objects;
create policy "prod_img_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'produtos'
    and (storage.foldername(name))[1] = public.empresa_do_usuario()::text
    and public.tem_permissao('produtos','editar')
  );
