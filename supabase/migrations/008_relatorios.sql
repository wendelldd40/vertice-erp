-- ============================================================
-- VÉRTICE ERP — Migration 008: Relatórios
-- Agregações no Postgres (1 viagem por relatório) e Curva ABC
-- calculada no banco. Execute APÓS a 007.
-- ============================================================

-- ---------- Relatório de vendas por período ----------
create or replace function public.relatorio_vendas(p_inicio date, p_fim date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_empresa uuid := public.empresa_do_usuario();
  v jsonb;
begin
  if not public.tem_permissao('relatorios', 'ver') then
    raise exception 'Sem permissão';
  end if;

  select jsonb_build_object(
    'faturamento', coalesce(sum(total), 0),
    'qtd_vendas', count(*),
    'ticket_medio', coalesce(avg(total), 0),
    'descontos', coalesce(sum(desconto), 0),

    'por_forma', coalesce((
      select jsonb_agg(t) from (
        select forma_pagamento as forma, count(*) as qtd, sum(total) as total
        from vendas
        where empresa_id = v_empresa and status = 'concluida'
          and criado_em >= p_inicio and criado_em < p_fim + 1
        group by forma_pagamento order by sum(total) desc
      ) t), '[]'::jsonb),

    'por_vendedor', coalesce((
      select jsonb_agg(t) from (
        select coalesce(pr.nome, pr.email, '—') as vendedor, count(*) as qtd, sum(v2.total) as total
        from vendas v2
        left join profiles pr on pr.id = v2.vendedor_id
        where v2.empresa_id = v_empresa and v2.status = 'concluida'
          and v2.criado_em >= p_inicio and v2.criado_em < p_fim + 1
        group by 1 order by sum(v2.total) desc
      ) t), '[]'::jsonb),

    'por_dia', coalesce((
      select jsonb_agg(t order by t.dia) from (
        select criado_em::date as dia, count(*) as qtd, sum(total) as total
        from vendas
        where empresa_id = v_empresa and status = 'concluida'
          and criado_em >= p_inicio and criado_em < p_fim + 1
        group by 1
      ) t), '[]'::jsonb)
  ) into v
  from vendas
  where empresa_id = v_empresa and status = 'concluida'
    and criado_em >= p_inicio and criado_em < p_fim + 1;

  return v;
end $$;

-- ---------- Curva ABC de produtos ----------
-- Classe A: produtos que acumulam até 80% do faturamento.
-- Classe B: de 80% a 95%. Classe C: o resto.
create or replace function public.relatorio_abc(p_inicio date, p_fim date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_empresa uuid := public.empresa_do_usuario();
  v jsonb;
begin
  if not public.tem_permissao('relatorios', 'ver') then
    raise exception 'Sem permissão';
  end if;

  select coalesce(jsonb_agg(t order by t.total desc), '[]'::jsonb) into v
  from (
    select
      base.nome,
      base.quantidade,
      base.total,
      round(base.pct::numeric, 1) as pct,
      case
        when base.acumulado <= 80 then 'A'
        when base.acumulado <= 95 then 'B'
        else 'C'
      end as classe
    from (
      select
        vi.produto_nome as nome,
        sum(vi.quantidade) as quantidade,
        sum(vi.total) as total,
        100.0 * sum(vi.total) / nullif(sum(sum(vi.total)) over (), 0) as pct,
        100.0 * sum(sum(vi.total)) over (order by sum(vi.total) desc
          rows between unbounded preceding and current row)
          / nullif(sum(sum(vi.total)) over (), 0) as acumulado
      from venda_itens vi
      join vendas v2 on v2.id = vi.venda_id
      where vi.empresa_id = v_empresa and v2.status = 'concluida'
        and v2.criado_em >= p_inicio and v2.criado_em < p_fim + 1
      group by vi.produto_nome
    ) base
  ) t;

  return v;
end $$;

-- ---------- Relatório de estoque ----------
create or replace function public.relatorio_estoque()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_empresa uuid := public.empresa_do_usuario();
  v jsonb;
begin
  if not public.tem_permissao('relatorios', 'ver') then
    raise exception 'Sem permissão';
  end if;

  select jsonb_build_object(
    'valor_custo', coalesce((
      select sum(s.quantidade * p.preco_custo)
      from estoque_saldos s join produtos p on p.id = s.produto_id
      where s.empresa_id = v_empresa and s.quantidade > 0), 0),
    'valor_venda', coalesce((
      select sum(s.quantidade * p.preco_venda)
      from estoque_saldos s join produtos p on p.id = s.produto_id
      where s.empresa_id = v_empresa and s.quantidade > 0), 0),
    'itens_em_estoque', coalesce((
      select sum(s.quantidade) from estoque_saldos s
      where s.empresa_id = v_empresa and s.quantidade > 0), 0),

    -- Produtos parados: têm saldo mas não vendem há 30+ dias (ou nunca)
    'parados', coalesce((
      select jsonb_agg(t) from (
        select p.nome,
               coalesce(sum(s.quantidade), 0) as saldo,
               coalesce(sum(s.quantidade) * max(p.preco_custo), 0) as valor_parado,
               max(uv.ultima) as ultima_venda
        from produtos p
        join estoque_saldos s on s.produto_id = p.id
        left join (
          select vi.produto_id, max(v2.criado_em) as ultima
          from venda_itens vi join vendas v2 on v2.id = vi.venda_id
          where vi.empresa_id = v_empresa and v2.status = 'concluida'
          group by vi.produto_id
        ) uv on uv.produto_id = p.id
        where p.empresa_id = v_empresa and p.ativo = true
        group by p.id, p.nome
        having coalesce(sum(s.quantidade), 0) > 0
           and (max(uv.ultima) is null or max(uv.ultima) < now() - interval '30 days')
        order by coalesce(sum(s.quantidade) * max(p.preco_custo), 0) desc
        limit 20
      ) t), '[]'::jsonb)
  ) into v;

  return v;
end $$;
