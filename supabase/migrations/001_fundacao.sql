-- ============================================================
-- VÉRTICE ERP — Migration 001: Fundação multi-tenant
-- Empresas, perfis, permissões por função, convites e RLS.
-- Execute no SQL Editor do Supabase.
-- ============================================================

-- ---------- EMPRESAS (tenants) ----------
create table if not exists public.empresas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  cnpj        text,
  telefone    text,
  plano       text not null default 'trial', -- trial | essencial | pro
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- ---------- PERFIS (1:1 com auth.users) ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  empresa_id  uuid references public.empresas(id) on delete set null,
  nome        text not null default '',
  email       text not null default '',
  role        text not null default 'dono', -- dono | gerente | vendedor | caixa | estoquista
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- ---------- PERMISSÕES (função × módulo × ação, por empresa) ----------
create table if not exists public.permissoes (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas(id) on delete cascade,
  role         text not null,
  modulo       text not null,  -- dashboard | vendas | pedidos | clientes | produtos | estoque | compras | financeiro | relatorios | usuarios | configuracoes
  pode_ver     boolean not null default false,
  pode_criar   boolean not null default false,
  pode_editar  boolean not null default false,
  pode_excluir boolean not null default false,
  unique (empresa_id, role, modulo)
);

-- ---------- CONVITES ----------
create table if not exists public.convites (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  email       text not null,
  role        text not null default 'vendedor',
  token       uuid not null default gen_random_uuid(),
  aceito      boolean not null default false,
  expira_em   timestamptz not null default now() + interval '7 days',
  criado_em   timestamptz not null default now()
);

-- ============================================================
-- FUNÇÕES AUXILIARES
-- ============================================================

-- Empresa do usuário logado (usada em todas as policies)
create or replace function public.empresa_do_usuario()
returns uuid
language sql stable security definer set search_path = public as $$
  select empresa_id from public.profiles where id = auth.uid()
$$;

-- Role do usuário logado
create or replace function public.role_do_usuario()
returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Cria profile automaticamente no signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nome)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'nome', ''));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Permissões padrão ao criar empresa
create or replace function public.seed_permissoes(p_empresa uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  m text;
  modulos text[] := array['dashboard','vendas','pedidos','clientes','produtos','estoque','compras','financeiro','relatorios','usuarios','configuracoes'];
begin
  foreach m in array modulos loop
    -- Dono: tudo
    insert into public.permissoes (empresa_id, role, modulo, pode_ver, pode_criar, pode_editar, pode_excluir)
    values (p_empresa, 'dono', m, true, true, true, true)
    on conflict (empresa_id, role, modulo) do nothing;
    -- Gerente: tudo, exceto excluir em financeiro/usuários
    insert into public.permissoes (empresa_id, role, modulo, pode_ver, pode_criar, pode_editar, pode_excluir)
    values (p_empresa, 'gerente', m, true, true, true, m not in ('financeiro','usuarios'))
    on conflict (empresa_id, role, modulo) do nothing;
    -- Vendedor: comercial
    insert into public.permissoes (empresa_id, role, modulo, pode_ver, pode_criar, pode_editar, pode_excluir)
    values (p_empresa, 'vendedor', m,
      m in ('dashboard','vendas','pedidos','clientes','produtos'),
      m in ('vendas','pedidos','clientes'),
      m in ('vendas','pedidos','clientes'),
      false)
    on conflict (empresa_id, role, modulo) do nothing;
    -- Caixa: vendas e financeiro básico
    insert into public.permissoes (empresa_id, role, modulo, pode_ver, pode_criar, pode_editar, pode_excluir)
    values (p_empresa, 'caixa', m,
      m in ('dashboard','vendas','financeiro','clientes'),
      m in ('vendas'),
      m in ('vendas'),
      false)
    on conflict (empresa_id, role, modulo) do nothing;
    -- Estoquista: catálogo e suprimentos
    insert into public.permissoes (empresa_id, role, modulo, pode_ver, pode_criar, pode_editar, pode_excluir)
    values (p_empresa, 'estoquista', m,
      m in ('dashboard','produtos','estoque','compras'),
      m in ('produtos','estoque','compras'),
      m in ('produtos','estoque','compras'),
      false)
    on conflict (empresa_id, role, modulo) do nothing;
  end loop;
end $$;

-- Onboarding: cria empresa e vincula o usuário como dono (RPC chamada pelo front)
create or replace function public.criar_empresa(p_nome text, p_cnpj text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_empresa uuid;
begin
  if (select empresa_id from public.profiles where id = auth.uid()) is not null then
    raise exception 'Usuário já pertence a uma empresa';
  end if;
  insert into public.empresas (nome, cnpj) values (p_nome, p_cnpj) returning id into v_empresa;
  update public.profiles set empresa_id = v_empresa, role = 'dono' where id = auth.uid();
  perform public.seed_permissoes(v_empresa);
  return v_empresa;
end $$;

-- Aceitar convite (RPC chamada pelo front após signup/login)
create or replace function public.aceitar_convite(p_token uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v convites%rowtype;
begin
  select * into v from public.convites
   where token = p_token and aceito = false and expira_em > now();
  if not found then
    raise exception 'Convite inválido ou expirado';
  end if;
  update public.profiles set empresa_id = v.empresa_id, role = v.role where id = auth.uid();
  update public.convites set aceito = true where id = v.id;
end $$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.empresas   enable row level security;
alter table public.profiles   enable row level security;
alter table public.permissoes enable row level security;
alter table public.convites   enable row level security;

-- Empresas: membro vê e dono edita
create policy "empresa_select" on public.empresas
  for select using (id = public.empresa_do_usuario());
create policy "empresa_update" on public.empresas
  for update using (id = public.empresa_do_usuario() and public.role_do_usuario() = 'dono');

-- Profiles: vê o próprio + colegas da empresa; edita o próprio; dono/gerente editam colegas
create policy "profiles_select" on public.profiles
  for select using (id = auth.uid() or empresa_id = public.empresa_do_usuario());
create policy "profiles_update_self" on public.profiles
  for update using (id = auth.uid());
create policy "profiles_update_admin" on public.profiles
  for update using (
    empresa_id = public.empresa_do_usuario()
    and public.role_do_usuario() in ('dono','gerente')
  );

-- Permissões: membros leem; só dono altera
create policy "permissoes_select" on public.permissoes
  for select using (empresa_id = public.empresa_do_usuario());
create policy "permissoes_update" on public.permissoes
  for update using (empresa_id = public.empresa_do_usuario() and public.role_do_usuario() = 'dono');

-- Convites: dono/gerente gerenciam
create policy "convites_select" on public.convites
  for select using (empresa_id = public.empresa_do_usuario() and public.role_do_usuario() in ('dono','gerente'));
create policy "convites_insert" on public.convites
  for insert with check (empresa_id = public.empresa_do_usuario() and public.role_do_usuario() in ('dono','gerente'));
create policy "convites_delete" on public.convites
  for delete using (empresa_id = public.empresa_do_usuario() and public.role_do_usuario() in ('dono','gerente'));

-- Índices
create index if not exists idx_profiles_empresa   on public.profiles (empresa_id);
create index if not exists idx_permissoes_empresa on public.permissoes (empresa_id, role);
create index if not exists idx_convites_token     on public.convites (token);
