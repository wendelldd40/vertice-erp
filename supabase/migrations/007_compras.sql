-- ============================================================
-- VÉRTICE ERP — Migration 007: Compras + Fornecedores
-- Receber a compra = entrada no estoque + atualização do custo
-- + conta a pagar, tudo numa transação. Execute APÓS a 006.
-- ============================================================

alter table public.empresas
  add column if not exists proximo_numero_compra bigint not null default 1;

-- ---------- FORNECEDORES ----------
create table if not exists public.fornecedores (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  nome        text not null,
  cnpj        text,
  telefone    text,
  email       text,
  cidade      text,
  uf          text,
  observacoes text,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- ---------- COMPRAS ----------
create table if not exists public.compras (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  numero        bigint not null,
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  status        text not null default 'pendente' check (status in ('pendente','recebida','cancelada')),
  total         numeric(12,2) not null default 0,
  observacoes   text,
  criado_por    uuid references public.profiles(id),
  criado_em     timestamptz not null default now(),
  recebido_em   timestamptz,
  unique (empresa_id, numero)
);

create table if not exists public.compra_itens (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  compra_id      uuid not null references public.compras(id) on delete cascade,
  produto_id     uuid not null references public.produtos(id),
  produto_nome   text not null,
  quantidade     numeric(12,3) not null,
  custo_unitario numeric(12,2) not null,
  total          numeric(12,2) not null
);

-- ---------- RPC: criar pedido de compra ----------
-- p_itens: [{"produto_id":"...","quantidade":10,"custo_unitario":5.5}, ...]
create or replace function public.criar_compra(
  p_itens jsonb,
  p_fornecedor uuid default null,
  p_observacoes text default null
)
returns table (compra_id uuid, numero bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_empresa uuid := public.empresa_do_usuario();
  v_numero bigint;
  v_compra uuid;
  v_item jsonb;
  v_produto uuid;
  v_qtd numeric;
  v_custo numeric;
  v_total numeric := 0;
  v_nome text;
begin
  if v_empresa is null then raise exception 'Sem empresa'; end if;
  if not public.tem_permissao('compras', 'criar') then
    raise exception 'Sem permissão para criar compras';
  end if;
  if jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) = 0 then
    raise exception 'A compra precisa ter ao menos um item';
  end if;
  if p_fornecedor is not null then
    perform 1 from public.fornecedores where id = p_fornecedor and empresa_id = v_empresa;
    if not found then raise exception 'Fornecedor inválido'; end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (v_item->>'quantidade')::numeric;
    v_custo := (v_item->>'custo_unitario')::numeric;
    if v_qtd is null or v_qtd <= 0 then raise exception 'Quantidade inválida'; end if;
    if v_custo is null or v_custo < 0 then raise exception 'Custo inválido'; end if;
    perform 1 from public.produtos
      where id = (v_item->>'produto_id')::uuid and empresa_id = v_empresa;
    if not found then raise exception 'Produto inválido'; end if;
    v_total := v_total + (v_qtd * v_custo);
  end loop;

  update public.empresas
     set proximo_numero_compra = proximo_numero_compra + 1
   where id = v_empresa
  returning proximo_numero_compra - 1 into v_numero;

  insert into public.compras (empresa_id, numero, fornecedor_id, total, observacoes, criado_por)
  values (v_empresa, v_numero, p_fornecedor, v_total, p_observacoes, auth.uid())
  returning id into v_compra;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_produto := (v_item->>'produto_id')::uuid;
    v_qtd := (v_item->>'quantidade')::numeric;
    v_custo := (v_item->>'custo_unitario')::numeric;
    select nome into v_nome from public.produtos where id = v_produto;

    insert into public.compra_itens
      (empresa_id, compra_id, produto_id, produto_nome, quantidade, custo_unitario, total)
    values (v_empresa, v_compra, v_produto, v_nome, v_qtd, v_custo, v_qtd * v_custo);
  end loop;

  return query select v_compra, v_numero;
end $$;

-- ---------- RPC: receber compra ----------
-- Entrada no estoque + atualiza preço de custo do produto + gera conta a pagar.
create or replace function public.receber_compra(
  p_compra uuid,
  p_vencimento date default current_date + 30,
  p_gerar_financeiro boolean default true
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_empresa uuid := public.empresa_do_usuario();
  v_compra compras%rowtype;
  v_deposito uuid;
  v_cat uuid;
  v_fornecedor text;
  r record;
begin
  if not public.tem_permissao('compras', 'editar') then
    raise exception 'Sem permissão para receber compras';
  end if;

  select * into v_compra from public.compras
   where id = p_compra and empresa_id = v_empresa for update;
  if not found then raise exception 'Compra não encontrada'; end if;
  if v_compra.status <> 'pendente' then raise exception 'Compra já % ', v_compra.status; end if;

  select id into v_deposito from public.depositos
   where empresa_id = v_empresa and padrao = true limit 1;
  if v_deposito is null then
    select id into v_deposito from public.depositos where empresa_id = v_empresa limit 1;
  end if;
  if v_deposito is null then raise exception 'Nenhum depósito cadastrado'; end if;

  for r in select * from public.compra_itens where compra_id = p_compra loop
    -- Entrada no estoque
    insert into public.estoque_saldos (empresa_id, produto_id, deposito_id, quantidade)
    values (v_empresa, r.produto_id, v_deposito, r.quantidade)
    on conflict (produto_id, deposito_id)
    do update set quantidade = estoque_saldos.quantidade + excluded.quantidade;

    insert into public.estoque_movimentacoes
      (empresa_id, produto_id, deposito_id, tipo, quantidade, custo_unitario, motivo, usuario_id)
    values
      (v_empresa, r.produto_id, v_deposito, 'entrada', r.quantidade, r.custo_unitario,
       'Compra #' || v_compra.numero, auth.uid());

    -- Atualiza o preço de custo com o valor real pago (margem sempre honesta)
    update public.produtos
       set preco_custo = r.custo_unitario
     where id = r.produto_id and empresa_id = v_empresa;
  end loop;

  -- Conta a pagar
  if p_gerar_financeiro and v_compra.total > 0 then
    select id into v_cat from public.categorias_financeiras
     where empresa_id = v_empresa and nome = 'Fornecedores' and tipo = 'despesa' limit 1;
    select nome into v_fornecedor from public.fornecedores where id = v_compra.fornecedor_id;

    insert into public.lancamentos
      (empresa_id, tipo, descricao, categoria_id, valor, vencimento, status, criado_por)
    values
      (v_empresa, 'despesa',
       'Compra #' || v_compra.numero || coalesce(' — ' || v_fornecedor, ''),
       v_cat, v_compra.total, coalesce(p_vencimento, current_date + 30), 'aberto', auth.uid());
  end if;

  update public.compras
     set status = 'recebida', recebido_em = now()
   where id = p_compra;
end $$;

-- ---------- RPC: cancelar compra pendente ----------
create or replace function public.cancelar_compra(p_compra uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_empresa uuid := public.empresa_do_usuario();
  v_status text;
begin
  if not public.tem_permissao('compras', 'excluir') then
    raise exception 'Sem permissão para cancelar compras';
  end if;
  select status into v_status from public.compras
   where id = p_compra and empresa_id = v_empresa for update;
  if not found then raise exception 'Compra não encontrada'; end if;
  if v_status <> 'pendente' then
    raise exception 'Só compras pendentes podem ser canceladas';
  end if;
  update public.compras set status = 'cancelada' where id = p_compra;
end $$;

-- ---------- RLS ----------
alter table public.fornecedores enable row level security;
alter table public.compras      enable row level security;
alter table public.compra_itens enable row level security;

create policy "forn_select" on public.fornecedores for select
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('compras','ver'));
create policy "forn_insert" on public.fornecedores for insert
  with check (empresa_id = public.empresa_do_usuario() and public.tem_permissao('compras','criar'));
create policy "forn_update" on public.fornecedores for update
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('compras','editar'));
create policy "forn_delete" on public.fornecedores for delete
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('compras','excluir'));

create policy "compras_select" on public.compras for select
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('compras','ver'));
create policy "compra_itens_select" on public.compra_itens for select
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('compras','ver'));

create index if not exists idx_forn_empresa on public.fornecedores (empresa_id, ativo);
create index if not exists idx_compras_empresa on public.compras (empresa_id, criado_em desc);
create index if not exists idx_compra_itens_compra on public.compra_itens (compra_id);
