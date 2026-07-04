-- ============================================================
-- VÉRTICE ERP — Migration 010: Marketplace (Mercado Livre)
-- Tokens guardados FORA do alcance do navegador (sem policy de
-- select — só as Edge Functions com service role acessam).
-- Execute APÓS a 009.
-- ============================================================

-- ---------- CONTAS CONECTADAS (segredos) ----------
create table if not exists public.marketplace_contas (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  marketplace   text not null default 'mercadolivre',
  usuario_externo text,               -- ml_user_id
  apelido       text,                 -- nickname da conta no ML
  access_token  text,
  refresh_token text,
  expira_em     timestamptz,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, marketplace)
);

drop trigger if exists trg_mkt_contas_touch on public.marketplace_contas;
create trigger trg_mkt_contas_touch before update on public.marketplace_contas
  for each row execute function public.touch_atualizado_em();

-- RLS ligado e NENHUMA policy: o cliente (anon key) não lê nem escreve.
-- Apenas Edge Functions com service role enxergam esta tabela.
alter table public.marketplace_contas enable row level security;

-- ---------- VISÃO SEGURA DE STATUS (sem tokens) ----------
-- security definer + filtro por empresa: o front vê SE está conectado,
-- nunca os tokens.
create or replace view public.marketplace_conexoes
with (security_invoker = false) as
  select empresa_id, marketplace, usuario_externo, apelido, criado_em, atualizado_em
  from public.marketplace_contas
  where empresa_id = public.empresa_do_usuario();

grant select on public.marketplace_conexoes to authenticated;

-- ---------- VÍNCULO PRODUTO ↔ ANÚNCIO ----------
create table if not exists public.produto_vinculos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  produto_id    uuid not null references public.produtos(id) on delete cascade,
  marketplace   text not null default 'mercadolivre',
  item_externo  text not null,        -- MLB123456789
  titulo_externo text,
  criado_em     timestamptz not null default now(),
  unique (empresa_id, marketplace, item_externo)
);

alter table public.produto_vinculos enable row level security;

create policy "vinc_select" on public.produto_vinculos for select
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('produtos','ver'));
create policy "vinc_insert" on public.produto_vinculos for insert
  with check (empresa_id = public.empresa_do_usuario() and public.tem_permissao('produtos','editar'));
create policy "vinc_update" on public.produto_vinculos for update
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('produtos','editar'));
create policy "vinc_delete" on public.produto_vinculos for delete
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('produtos','editar'));

create index if not exists idx_vinculos_empresa on public.produto_vinculos (empresa_id, marketplace);
create index if not exists idx_vinculos_produto on public.produto_vinculos (produto_id);

-- ---------- PEDIDOS IMPORTADOS DO MARKETPLACE ----------
-- Escritos apenas pela Edge Function (service role). O front lê.
create table if not exists public.pedidos_marketplace (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  marketplace    text not null default 'mercadolivre',
  pedido_externo text not null,
  status         text not null default 'novo',   -- novo | processado | ignorado
  total          numeric(12,2),
  comprador      text,
  dados          jsonb not null default '{}'::jsonb,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (empresa_id, marketplace, pedido_externo)
);

drop trigger if exists trg_pedidos_mkt_touch on public.pedidos_marketplace;
create trigger trg_pedidos_mkt_touch before update on public.pedidos_marketplace
  for each row execute function public.touch_atualizado_em();

alter table public.pedidos_marketplace enable row level security;

create policy "pmkt_select" on public.pedidos_marketplace for select
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('pedidos','ver'));
create policy "pmkt_update" on public.pedidos_marketplace for update
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('pedidos','editar'));

create index if not exists idx_pmkt_empresa on public.pedidos_marketplace (empresa_id, status, criado_em desc);
