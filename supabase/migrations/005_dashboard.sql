-- ============================================================
-- VÉRTICE ERP — Migration 005: Dashboard
-- Uma única RPC agrega todos os KPIs: 1 viagem ao banco,
-- dashboard instantâneo. Execute APÓS a 004.
-- ============================================================

create or replace function public.dashboard_resumo()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_empresa uuid := public.empresa_do_usuario();
  v jsonb;
begin
  if v_empresa is null then raise exception 'Sem empresa'; end if;
  if not public.tem_permissao('dashboard', 'ver') then
    raise exception 'Sem permissão';
  end if;

  select jsonb_build_object(

    -- ---------- Faturamento com comparativos ----------
    'hoje', coalesce((select sum(total) from vendas
      where empresa_id = v_empresa and status = 'concluida'
        and criado_em >= current_date), 0),
    'ontem', coalesce((select sum(total) from vendas
      where empresa_id = v_empresa and status = 'concluida'
        and criado_em >= current_date - 1 and criado_em < current_date), 0),

    'semana', coalesce((select sum(total) from vendas
      where empresa_id = v_empresa and status = 'concluida'
        and criado_em >= current_date - 6), 0),
    'semana_anterior', coalesce((select sum(total) from vendas
      where empresa_id = v_empresa and status = 'concluida'
        and criado_em >= current_date - 13 and criado_em < current_date - 6), 0),

    'mes', coalesce((select sum(total) from vendas
      where empresa_id = v_empresa and status = 'concluida'
        and criado_em >= date_trunc('month', current_date)), 0),
    'mes_anterior', coalesce((select sum(total) from vendas
      where empresa_id = v_empresa and status = 'concluida'
        and criado_em >= date_trunc('month', current_date) - interval '1 month'
        and criado_em < date_trunc('month', current_date)), 0),

    -- ---------- Vendas do mês ----------
    'qtd_vendas_mes', coalesce((select count(*) from vendas
      where empresa_id = v_empresa and status = 'concluida'
        and criado_em >= date_trunc('month', current_date)), 0),
    'ticket_mes', coalesce((select avg(total) from vendas
      where empresa_id = v_empresa and status = 'concluida'
        and criado_em >= date_trunc('month', current_date)), 0),

    -- ---------- Gráfico: vendas por dia (últimos 30 dias) ----------
    'vendas_por_dia', coalesce((
      select jsonb_agg(jsonb_build_object('dia', d.dia, 'total', coalesce(x.total, 0)) order by d.dia)
      from generate_series(current_date - 29, current_date, '1 day') as d(dia)
      left join (
        select criado_em::date as dia, sum(total) as total
        from vendas
        where empresa_id = v_empresa and status = 'concluida'
          and criado_em >= current_date - 29
        group by 1
      ) x on x.dia = d.dia
    ), '[]'::jsonb),

    -- ---------- Top produtos (30 dias) ----------
    'top_produtos', coalesce((
      select jsonb_agg(t) from (
        select vi.produto_nome as nome,
               sum(vi.quantidade) as quantidade,
               sum(vi.total) as total
        from venda_itens vi
        join vendas v2 on v2.id = vi.venda_id
        where vi.empresa_id = v_empresa
          and v2.status = 'concluida'
          and v2.criado_em >= current_date - 29
        group by vi.produto_nome
        order by sum(vi.total) desc
        limit 5
      ) t
    ), '[]'::jsonb),

    -- ---------- Alertas: estoque baixo ----------
    'estoque_baixo', coalesce((
      select jsonb_agg(t) from (
        select p.nome, coalesce(sum(s.quantidade), 0) as saldo, p.estoque_minimo
        from produtos p
        left join estoque_saldos s on s.produto_id = p.id
        where p.empresa_id = v_empresa and p.ativo = true and p.estoque_minimo > 0
        group by p.id, p.nome, p.estoque_minimo
        having coalesce(sum(s.quantidade), 0) <= p.estoque_minimo
        order by coalesce(sum(s.quantidade), 0) asc
        limit 5
      ) t
    ), '[]'::jsonb),

    -- ---------- Alertas: contas dos próximos 7 dias ----------
    'receber_7d', coalesce((select sum(valor) from lancamentos
      where empresa_id = v_empresa and tipo = 'receita' and status = 'aberto'
        and vencimento <= current_date + 7), 0),
    'pagar_7d', coalesce((select sum(valor) from lancamentos
      where empresa_id = v_empresa and tipo = 'despesa' and status = 'aberto'
        and vencimento <= current_date + 7), 0),
    'atrasados', coalesce((select count(*) from lancamentos
      where empresa_id = v_empresa and status = 'aberto'
        and vencimento < current_date), 0)

  ) into v;

  return v;
end $$;
