-- ============================================================
-- VÉRTICE ERP — Migration 009: Integrações (fase 1)
-- Hub de integrações + webhook automático de vendas via pg_net.
-- O webhook é assíncrono: NUNCA atrasa nem trava uma venda.
-- Execute APÓS a 008.
-- ============================================================

-- pg_net: requisições HTTP assíncronas a partir do Postgres
-- (disponível nativamente no Supabase)
create extension if not exists pg_net;

-- ---------- CONFIGURAÇÃO DE INTEGRAÇÕES ----------
create table if not exists public.integracoes (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  tipo        text not null,           -- webhook_vendas | mercadolivre | shopee | amazon ...
  config      jsonb not null default '{}'::jsonb,
  ativo       boolean not null default false,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, tipo)
);

drop trigger if exists trg_integracoes_touch on public.integracoes;
create trigger trg_integracoes_touch before update on public.integracoes
  for each row execute function public.touch_atualizado_em();

alter table public.integracoes enable row level security;

create policy "int_select" on public.integracoes for select
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('configuracoes','ver'));
create policy "int_insert" on public.integracoes for insert
  with check (empresa_id = public.empresa_do_usuario() and public.tem_permissao('configuracoes','editar'));
create policy "int_update" on public.integracoes for update
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('configuracoes','editar'));
create policy "int_delete" on public.integracoes for delete
  using (empresa_id = public.empresa_do_usuario() and public.tem_permissao('configuracoes','editar'));

create index if not exists idx_integracoes_empresa on public.integracoes (empresa_id, tipo);

-- ---------- WEBHOOK DE VENDAS ----------
-- Dispara um POST JSON para a URL configurada a cada venda.
-- pg_net enfileira a requisição: se a URL estiver fora do ar,
-- a venda é registrada normalmente (o webhook apenas falha em silêncio).
create or replace function public.disparar_webhook_venda()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_url text;
begin
  select config->>'url' into v_url
    from public.integracoes
   where empresa_id = new.empresa_id
     and tipo = 'webhook_vendas'
     and ativo = true
     and coalesce(config->>'url', '') like 'https://%'
   limit 1;

  if v_url is not null then
    begin
      perform net.http_post(
        url := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'evento', 'venda_criada',
          'venda_id', new.id,
          'numero', new.numero,
          'total', new.total,
          'subtotal', new.subtotal,
          'desconto', new.desconto,
          'forma_pagamento', new.forma_pagamento,
          'cliente_nome', new.cliente_nome,
          'criado_em', new.criado_em
        )
      );
    exception when others then
      null; -- webhook jamais impede uma venda
    end;
  end if;
  return new;
end $$;

drop trigger if exists trg_webhook_venda on public.vendas;
create trigger trg_webhook_venda after insert on public.vendas
  for each row execute function public.disparar_webhook_venda();

-- Também notifica cancelamentos
create or replace function public.disparar_webhook_venda_cancelada()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_url text;
begin
  if new.status = 'cancelada' and old.status <> 'cancelada' then
    select config->>'url' into v_url
      from public.integracoes
     where empresa_id = new.empresa_id
       and tipo = 'webhook_vendas'
       and ativo = true
       and coalesce(config->>'url', '') like 'https://%'
     limit 1;

    if v_url is not null then
      begin
        perform net.http_post(
          url := v_url,
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body := jsonb_build_object(
            'evento', 'venda_cancelada',
            'venda_id', new.id,
            'numero', new.numero,
            'total', new.total,
            'criado_em', new.criado_em
          )
        );
      exception when others then
        null;
      end;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_webhook_venda_cancelada on public.vendas;
create trigger trg_webhook_venda_cancelada after update on public.vendas
  for each row execute function public.disparar_webhook_venda_cancelada();
