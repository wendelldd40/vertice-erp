-- ============================================================
-- VÉRTICE ERP — Migration 003: Vendas / PDV
-- Venda atômica: cabeçalho + itens + baixa de estoque + auditoria
-- numa transação única. Execute APÓS a 002.
-- ============================================================

-- Contador de número de venda por empresa (com lock, sem colisão)
alter table public.empresas
  add column if not exists proximo_numero_venda bigint not null default 1;

-- ---------- VENDAS ----------
create table if not exists public.vendas (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas(id) on delete cascade,
  numero          bigint not null,
  cliente_nome    text,                          -- vínculo com CRM chega no módulo Clientes
  subtotal        numeric(12,2) not null default 0,
  desconto        numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,
  forma_pagamento text not null,                 -- dinheiro | pix | debito | credito
  valor_recebido  numeric(12,2),
  troco           numeric(12,2),
  status          text not null default 'concluida', -- concluida | cancelada
  vendedor_id     uuid references public.profiles(id),
  criado_em       timestamptz not null default now(),
  cancelado_em    timestamptz,
  unique (empresa_id, numero)
);

create table if not exists public.venda_itens (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  venda_id       uuid not null references public.vendas(id) on delete cascade,
  produto_id     uuid not null references public.produtos(id),
  produto_nome   text not null,                  -- snapshot: renomear o produto não altera vendas passadas
  quantidade     numeric(12,3) not null,
  preco_unitario numeric(12,2) not null,
  total          numeric(12,2) not null
);

-- ---------- RPC: registrar venda (única porta de escrita) ----------
-- p_itens: [{"produto_id": "...", "quantidade": 2, "preco_unitario": 10.5}, ...]
create or replace function public.registrar_venda(
  p_itens jsonb,
  p_forma_pagamento text,
  p_desconto numeric default 0,
  p_valor_recebido numeric default null,
  p_cliente_nome text default null
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

  -- Número sequencial com lock (dois caixas simultâneos nunca colidem)
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

  -- Valida itens e calcula subtotal
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
    (empresa_id, numero, cliente_nome, subtotal, desconto, total,
     forma_pagamento, valor_recebido, troco, vendedor_id)
  values
    (v_empresa, v_numero, nullif(trim(coalesce(p_cliente_nome, '')), ''), v_subtotal,
     coalesce(p_desconto, 0), v_total, p_forma_pagamento, p_valor_recebido, v_troco, auth.uid())
  returning id into v_venda;

  -- Itens + baixa de estoque + auditoria, tudo na mesma transação
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_produto := (v_item->>'produto_id')::uuid;
    v_qtd := (v_item->>'quantidade')::numeric;
    v_preco := (v_item->>'preco_unitario')::numeric;

    select nome into v_nome from public.produtos where id = v_produto;

    insert into public.venda_itens
      (empresa_id, venda_id, produto_id, produto_nome, quantidade, preco_unitario, total)
    values (v_empresa, v_venda, v_produto, v_nome, v_qtd, v_preco, v_qtd * v_preco);

    -- Baixa com lock de linha
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

-- ---------- RPC: cancelar venda (estorna estoque com rastro) ----------
create or replace function public.cancelar_venda(p_venda uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_empresa uuid := public.empresa_do_usuario();
  v_venda vendas%rowtype;
  v_deposito uuid;
  r record;
begin
  if not public.tem_permissao('vendas', 'excluir') then
    raise exception 'Sem permissão para cancelar vendas';
  end if;

  select * into v_venda from public.vendas
   where id = p_venda and empresa_id = v_empresa for update;
  if not found then raise exception 'Venda não encontrada'; end if;
  if v_venda.status = 'cancelada' then raise exception 'Venda já cancelada'; end if;

  select id into v_deposito from public.depositos
   where empresa_id = v_empresa and padrao = true limit 1;

  for r in select * from public.venda_itens where venda_id = p_venda loop
    insert into public.estoque_saldos (empresa_id, produto_id, deposito_id, quantidade)
    values (v_empresa, r.produto_id, v_deposito, r.quantidade)
    on conflict (produto_id, deposito_id)
    do update set quantidade = estoque_saldos.quantidade + excluded.quantidade;

    insert into public.estoque_movimentacoes
      (empresa_id, produto_id, deposito_id, tipo, quantidade, motivo, usuario_id)
    values
      (v_empresa, r.produto_id, v_deposito, 'entrada', r.quantidade,
       'Cancelamento da venda #' || v_venda.numero, auth.uid());
  end loop;

  update public.vendas
     set status = 'cancelada', cancelado_em = now()
   where id = p_venda;
end $$;

-- ---------- RLS: leitura via API, escrita só pelas RPCs ----------
alter table public.vendas      enable row level security;
alter table public.venda_itens enable row level security;

create policy "vendas_select" on public.vendas for select
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('vendas','ver'));
create policy "venda_itens_select" on public.venda_itens for select
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('vendas','ver'));

-- Índices
create index if not exists idx_vendas_empresa on public.vendas (empresa_id, criado_em desc);
create index if not exists idx_venda_itens_venda on public.venda_itens (venda_id);
create index if not exists idx_venda_itens_produto on public.venda_itens (produto_id);
