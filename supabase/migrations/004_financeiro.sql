-- ============================================================
-- VÉRTICE ERP — Migration 004: Financeiro
-- Categorias, lançamentos (pagar/receber) e integração
-- automática com vendas via trigger. Execute APÓS a 003.
-- ============================================================

-- ---------- CATEGORIAS FINANCEIRAS ----------
create table if not exists public.categorias_financeiras (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  nome        text not null,
  tipo        text not null check (tipo in ('receita','despesa')),
  sistema     boolean not null default false,  -- categorias criadas pelo sistema (ex.: Vendas)
  criado_em   timestamptz not null default now(),
  unique (empresa_id, nome, tipo)
);

-- ---------- LANÇAMENTOS ----------
create table if not exists public.lancamentos (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas(id) on delete cascade,
  tipo            text not null check (tipo in ('receita','despesa')),
  descricao       text not null,
  categoria_id    uuid references public.categorias_financeiras(id) on delete set null,
  valor           numeric(12,2) not null check (valor >= 0),
  vencimento      date not null default current_date,
  status          text not null default 'aberto' check (status in ('aberto','pago','cancelado')),
  pago_em         timestamptz,
  forma_pagamento text,             -- dinheiro | pix | debito | credito | boleto | transferencia
  venda_id        uuid references public.vendas(id) on delete set null,
  criado_por      uuid references public.profiles(id),
  criado_em       timestamptz not null default now()
);

-- ---------- SEED de categorias padrão ----------
create or replace function public.seed_categorias_financeiras(p_empresa uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.categorias_financeiras (empresa_id, nome, tipo, sistema) values
    (p_empresa, 'Vendas', 'receita', true),
    (p_empresa, 'Outras receitas', 'receita', false),
    (p_empresa, 'Fornecedores', 'despesa', false),
    (p_empresa, 'Aluguel', 'despesa', false),
    (p_empresa, 'Salários', 'despesa', false),
    (p_empresa, 'Impostos', 'despesa', false),
    (p_empresa, 'Marketing', 'despesa', false),
    (p_empresa, 'Outras despesas', 'despesa', false)
  on conflict (empresa_id, nome, tipo) do nothing;
end $$;

-- Backfill para empresas existentes
do $$
declare e record;
begin
  for e in select id from public.empresas loop
    perform public.seed_categorias_financeiras(e.id);
  end loop;
end $$;

-- E para empresas futuras
create or replace function public.criar_categorias_financeiras()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_categorias_financeiras(new.id);
  return new;
end $$;

drop trigger if exists trg_empresa_cat_fin on public.empresas;
create trigger trg_empresa_cat_fin after insert on public.empresas
  for each row execute function public.criar_categorias_financeiras();

-- ============================================================
-- INTEGRAÇÃO AUTOMÁTICA: venda concluída → lançamento de receita
-- Dinheiro/PIX/débito: pago na hora.
-- Crédito: contas a receber com vencimento em 30 dias.
-- ============================================================
create or replace function public.gerar_lancamento_da_venda()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cat uuid;
  v_pago boolean;
begin
  select id into v_cat from public.categorias_financeiras
   where empresa_id = new.empresa_id and nome = 'Vendas' and tipo = 'receita' limit 1;

  v_pago := new.forma_pagamento in ('dinheiro','pix','debito');

  insert into public.lancamentos
    (empresa_id, tipo, descricao, categoria_id, valor, vencimento,
     status, pago_em, forma_pagamento, venda_id, criado_por)
  values
    (new.empresa_id, 'receita', 'Venda #' || new.numero, v_cat, new.total,
     case when v_pago then current_date else current_date + 30 end,
     case when v_pago then 'pago' else 'aberto' end,
     case when v_pago then now() else null end,
     new.forma_pagamento, new.id, new.vendedor_id);
  return new;
end $$;

drop trigger if exists trg_venda_lancamento on public.vendas;
create trigger trg_venda_lancamento after insert on public.vendas
  for each row execute function public.gerar_lancamento_da_venda();

-- Venda cancelada → lançamento cancela junto
create or replace function public.cancelar_lancamento_da_venda()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelada' and old.status <> 'cancelada' then
    update public.lancamentos
       set status = 'cancelado'
     where venda_id = new.id and status <> 'cancelado';
  end if;
  return new;
end $$;

drop trigger if exists trg_venda_cancela_lancamento on public.vendas;
create trigger trg_venda_cancela_lancamento after update on public.vendas
  for each row execute function public.cancelar_lancamento_da_venda();

-- ============================================================
-- RLS
-- ============================================================
alter table public.categorias_financeiras enable row level security;
alter table public.lancamentos            enable row level security;

create policy "catfin_select" on public.categorias_financeiras for select
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('financeiro','ver'));
create policy "catfin_insert" on public.categorias_financeiras for insert
  with check (empresa_id = public.empresa_do_usuario() and public.tem_permissao('financeiro','criar'));
create policy "catfin_delete" on public.categorias_financeiras for delete
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('financeiro','excluir') and sistema = false);

create policy "lanc_select" on public.lancamentos for select
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('financeiro','ver'));
create policy "lanc_insert" on public.lancamentos for insert
  with check (empresa_id = public.empresa_do_usuario() and public.tem_permissao('financeiro','criar'));
create policy "lanc_update" on public.lancamentos for update
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('financeiro','editar'));
create policy "lanc_delete" on public.lancamentos for delete
  using (
    empresa_id = public.empresa_do_usuario()
    and public.tem_permissao('financeiro','excluir')
    and venda_id is null  -- lançamentos de venda só saem cancelando a venda
  );

-- Índices
create index if not exists idx_lanc_empresa_venc on public.lancamentos (empresa_id, vencimento);
create index if not exists idx_lanc_empresa_tipo on public.lancamentos (empresa_id, tipo, status);
create index if not exists idx_lanc_venda on public.lancamentos (venda_id);
create index if not exists idx_catfin_empresa on public.categorias_financeiras (empresa_id, tipo);
