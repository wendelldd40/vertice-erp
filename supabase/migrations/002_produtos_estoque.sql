-- ============================================================
-- VÉRTICE ERP — Migration 002: Produtos + Estoque
-- Categorias, produtos, depósitos, saldos e movimentações
-- auditáveis. Execute APÓS a 001.
-- ============================================================

-- ---------- HELPER: checagem de permissão dentro do banco ----------
create or replace function public.tem_permissao(p_modulo text, p_acao text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_role text;
  v_ok boolean;
begin
  select role into v_role from public.profiles where id = auth.uid() and ativo = true;
  if v_role is null then return false; end if;
  if v_role = 'dono' then return true; end if;

  execute format(
    'select %I from public.permissoes where empresa_id = public.empresa_do_usuario() and role = $1 and modulo = $2',
    'pode_' || p_acao
  ) into v_ok using v_role, p_modulo;

  return coalesce(v_ok, false);
end $$;

-- ---------- CATEGORIAS ----------
create table if not exists public.categorias (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  nome        text not null,
  criado_em   timestamptz not null default now(),
  unique (empresa_id, nome)
);

-- ---------- PRODUTOS ----------
create table if not exists public.produtos (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  nome               text not null,
  descricao          text,
  sku                text,
  codigo_barras      text,
  categoria_id       uuid references public.categorias(id) on delete set null,
  marca              text,
  unidade            text not null default 'un',      -- un | kg | l | m | cx | pct
  tipo               text not null default 'simples', -- simples | (variavel/kit em módulos futuros)
  preco_custo        numeric(12,2) not null default 0,
  preco_venda        numeric(12,2) not null default 0,
  preco_promocional  numeric(12,2),
  estoque_minimo     numeric(12,3) not null default 0,
  -- Fiscal (opcional no cadastro rápido)
  ncm                text,
  cest               text,
  origem             text,
  -- Logística (opcional)
  peso_kg            numeric(10,3),
  altura_cm          numeric(10,2),
  largura_cm         numeric(10,2),
  comprimento_cm     numeric(10,2),
  ativo              boolean not null default true,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

create or replace function public.touch_atualizado_em()
returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end $$;

drop trigger if exists trg_produtos_touch on public.produtos;
create trigger trg_produtos_touch before update on public.produtos
  for each row execute function public.touch_atualizado_em();

-- ---------- DEPÓSITOS ----------
create table if not exists public.depositos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  nome        text not null,
  padrao      boolean not null default false,
  criado_em   timestamptz not null default now()
);

-- Depósito padrão para empresas já existentes
insert into public.depositos (empresa_id, nome, padrao)
select e.id, 'Depósito principal', true
from public.empresas e
where not exists (select 1 from public.depositos d where d.empresa_id = e.id);

-- E para empresas futuras
create or replace function public.criar_deposito_padrao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.depositos (empresa_id, nome, padrao)
  values (new.id, 'Depósito principal', true);
  return new;
end $$;

drop trigger if exists trg_empresa_deposito on public.empresas;
create trigger trg_empresa_deposito after insert on public.empresas
  for each row execute function public.criar_deposito_padrao();

-- ---------- SALDOS (nunca editados diretamente) ----------
create table if not exists public.estoque_saldos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  produto_id  uuid not null references public.produtos(id) on delete cascade,
  deposito_id uuid not null references public.depositos(id) on delete cascade,
  quantidade  numeric(12,3) not null default 0,
  unique (produto_id, deposito_id)
);

-- ---------- MOVIMENTAÇÕES (fonte da verdade / auditoria) ----------
create table if not exists public.estoque_movimentacoes (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references public.empresas(id) on delete cascade,
  produto_id          uuid not null references public.produtos(id) on delete cascade,
  deposito_id         uuid not null references public.depositos(id),
  deposito_destino_id uuid references public.depositos(id),
  tipo                text not null check (tipo in ('entrada','saida','ajuste','transferencia')),
  quantidade          numeric(12,3) not null,  -- delta aplicado ao depósito de origem
  custo_unitario      numeric(12,2),
  motivo              text,
  usuario_id          uuid references public.profiles(id),
  criado_em           timestamptz not null default now()
);

-- ---------- RPC: única porta de escrita no estoque ----------
-- tipo='ajuste' recebe em p_quantidade o VALOR FINAL desejado (a função calcula o delta).
create or replace function public.movimentar_estoque(
  p_produto uuid,
  p_deposito uuid,
  p_tipo text,
  p_quantidade numeric,
  p_motivo text default null,
  p_deposito_destino uuid default null,
  p_custo_unitario numeric default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_empresa uuid := public.empresa_do_usuario();
  v_saldo numeric;
  v_delta numeric;
begin
  if v_empresa is null then raise exception 'Sem empresa'; end if;
  if not public.tem_permissao('estoque', 'editar') then
    raise exception 'Sem permissão para movimentar estoque';
  end if;
  -- Confere que produto e depósito pertencem à empresa
  perform 1 from public.produtos where id = p_produto and empresa_id = v_empresa;
  if not found then raise exception 'Produto inválido'; end if;
  perform 1 from public.depositos where id = p_deposito and empresa_id = v_empresa;
  if not found then raise exception 'Depósito inválido'; end if;

  -- Garante linha de saldo (lock para concorrência)
  insert into public.estoque_saldos (empresa_id, produto_id, deposito_id)
  values (v_empresa, p_produto, p_deposito)
  on conflict (produto_id, deposito_id) do nothing;

  select quantidade into v_saldo from public.estoque_saldos
   where produto_id = p_produto and deposito_id = p_deposito for update;

  if p_tipo = 'entrada' then
    if p_quantidade <= 0 then raise exception 'Quantidade deve ser maior que zero'; end if;
    v_delta := p_quantidade;

  elsif p_tipo = 'saida' then
    if p_quantidade <= 0 then raise exception 'Quantidade deve ser maior que zero'; end if;
    if v_saldo < p_quantidade then raise exception 'Saldo insuficiente (disponível: %)', v_saldo; end if;
    v_delta := -p_quantidade;

  elsif p_tipo = 'ajuste' then
    if p_quantidade < 0 then raise exception 'Quantidade não pode ser negativa'; end if;
    v_delta := p_quantidade - v_saldo;
    if v_delta = 0 then return; end if;

  elsif p_tipo = 'transferencia' then
    if p_deposito_destino is null then raise exception 'Informe o depósito de destino'; end if;
    if p_deposito_destino = p_deposito then raise exception 'Origem e destino iguais'; end if;
    perform 1 from public.depositos where id = p_deposito_destino and empresa_id = v_empresa;
    if not found then raise exception 'Depósito de destino inválido'; end if;
    if p_quantidade <= 0 then raise exception 'Quantidade deve ser maior que zero'; end if;
    if v_saldo < p_quantidade then raise exception 'Saldo insuficiente (disponível: %)', v_saldo; end if;
    v_delta := -p_quantidade;

    -- credita destino
    insert into public.estoque_saldos (empresa_id, produto_id, deposito_id, quantidade)
    values (v_empresa, p_produto, p_deposito_destino, p_quantidade)
    on conflict (produto_id, deposito_id)
    do update set quantidade = estoque_saldos.quantidade + excluded.quantidade;
  else
    raise exception 'Tipo de movimentação inválido';
  end if;

  update public.estoque_saldos
     set quantidade = quantidade + v_delta
   where produto_id = p_produto and deposito_id = p_deposito;

  insert into public.estoque_movimentacoes
    (empresa_id, produto_id, deposito_id, deposito_destino_id, tipo, quantidade, custo_unitario, motivo, usuario_id)
  values
    (v_empresa, p_produto, p_deposito, p_deposito_destino, p_tipo, v_delta, p_custo_unitario, p_motivo, auth.uid());
end $$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.categorias             enable row level security;
alter table public.produtos               enable row level security;
alter table public.depositos              enable row level security;
alter table public.estoque_saldos         enable row level security;
alter table public.estoque_movimentacoes  enable row level security;

-- Categorias
create policy "cat_select" on public.categorias for select
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('produtos','ver'));
create policy "cat_insert" on public.categorias for insert
  with check (empresa_id = public.empresa_do_usuario() and public.tem_permissao('produtos','criar'));
create policy "cat_update" on public.categorias for update
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('produtos','editar'));
create policy "cat_delete" on public.categorias for delete
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('produtos','excluir'));

-- Produtos
create policy "prod_select" on public.produtos for select
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('produtos','ver'));
create policy "prod_insert" on public.produtos for insert
  with check (empresa_id = public.empresa_do_usuario() and public.tem_permissao('produtos','criar'));
create policy "prod_update" on public.produtos for update
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('produtos','editar'));
create policy "prod_delete" on public.produtos for delete
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('produtos','excluir'));

-- Depósitos
create policy "dep_select" on public.depositos for select
  using (empresa_id = public.empresa_do_usuario());
create policy "dep_insert" on public.depositos for insert
  with check (empresa_id = public.empresa_do_usuario() and public.tem_permissao('estoque','criar'));
create policy "dep_update" on public.depositos for update
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('estoque','editar'));

-- Saldos: somente leitura via API (escrita só pela RPC, que é security definer)
create policy "saldo_select" on public.estoque_saldos for select
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('estoque','ver'));

-- Movimentações: somente leitura via API (escrita só pela RPC)
create policy "mov_select" on public.estoque_movimentacoes for select
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('estoque','ver'));

-- Índices
create index if not exists idx_produtos_empresa   on public.produtos (empresa_id, ativo);
create index if not exists idx_produtos_nome      on public.produtos using gin (to_tsvector('portuguese', nome));
create index if not exists idx_categorias_empresa on public.categorias (empresa_id);
create index if not exists idx_saldos_produto     on public.estoque_saldos (produto_id);
create index if not exists idx_saldos_empresa     on public.estoque_saldos (empresa_id);
create index if not exists idx_mov_produto        on public.estoque_movimentacoes (produto_id, criado_em desc);
create index if not exists idx_mov_empresa        on public.estoque_movimentacoes (empresa_id, criado_em desc);
