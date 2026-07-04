import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, CalendarClock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { moeda, numero } from '../lib/formatos'

export default function Dashboard() {
  const { profile, empresa } = useAuth()
  const [d, setD] = useState(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('dashboard_resumo')
    if (error) { setErro(error.message); return }
    setD(data)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const primeiroNome = (profile?.nome || '').split(' ')[0]

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{saudacao}{primeiroNome ? `, ${primeiroNome}` : ''}</h1>
          <p className="page-sub">Visão geral de {empresa?.nome}</p>
        </div>
      </div>

      {erro && (
        <div className="badge badge-warn" style={{ marginBottom: 16 }}>
          {erro.includes('function') ? 'Execute a migration 005_dashboard.sql no Supabase para ativar o dashboard.' : erro}
        </div>
      )}

      {/* KPIs com comparativo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginBottom: 18 }}>
        <Kpi titulo="Hoje" valor={d?.hoje} anterior={d?.ontem} rotuloAnterior="vs ontem" carregando={!d} />
        <Kpi titulo="Últimos 7 dias" valor={d?.semana} anterior={d?.semana_anterior} rotuloAnterior="vs 7 dias antes" carregando={!d} />
        <Kpi titulo="Este mês" valor={d?.mes} anterior={d?.mes_anterior} rotuloAnterior="vs mês anterior" carregando={!d} />
        <div className="card" style={{ padding: 18 }}>
          <div className="kpi-label">Vendas no mês</div>
          {!d ? <div className="skeleton" style={{ height: 26, marginTop: 8, width: 80 }} /> : (
            <>
              <div style={{ fontSize: 23, fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: 6 }}>
                {d.qtd_vendas_mes}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Ticket médio: {moeda(d.ticket_mes)}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Gráfico + Top produtos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', gap: 16, marginBottom: 18 }} className="dash-grid">
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Vendas — últimos 30 dias</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
            Passe o mouse sobre as barras para ver o dia.
          </div>
          {!d ? <div className="skeleton" style={{ height: 140 }} /> : <GraficoBarras dados={d.vendas_por_dia} />}
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 14 }}>Top produtos (30 dias)</div>
          {!d ? (
            [1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 34, marginBottom: 10 }} />)
          ) : d.top_produtos.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>As primeiras vendas alimentam este ranking.</div>
          ) : (
            d.top_produtos.map((p, i) => (
              <div key={p.nome} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < d.top_produtos.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                  background: i === 0 ? 'var(--accent-soft)' : 'var(--surface-2)',
                  color: i === 0 ? 'var(--accent-text)' : 'var(--text-muted)',
                  display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700,
                }}>{i + 1}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nome}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{numero(p.quantidade)} un.</div>
                </div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{moeda(p.total)}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Alertas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} style={{ color: 'var(--warn)' }} /> Estoque baixo
          </div>
          {!d ? (
            <div className="skeleton" style={{ height: 60 }} />
          ) : d.estoque_baixo.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Tudo acima do mínimo. 👌</div>
          ) : (
            <>
              {d.estoque_baixo.map((p) => (
                <div key={p.nome} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0' }}>
                  <span style={{ fontWeight: 500 }}>{p.nome}</span>
                  <span className={`badge ${Number(p.saldo) <= 0 ? 'badge-danger' : 'badge-warn'}`}>
                    {numero(p.saldo)} / mín. {numero(p.estoque_minimo)}
                  </span>
                </div>
              ))}
              <Link to="/estoque" style={{ fontSize: 13, display: 'inline-block', marginTop: 8 }}>Ir para o estoque →</Link>
            </>
          )}
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CalendarClock size={16} style={{ color: 'var(--accent-text)' }} /> Próximos 7 dias
          </div>
          {!d ? (
            <div className="skeleton" style={{ height: 60 }} />
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0' }}>
                <span>A receber</span>
                <span style={{ fontWeight: 600, color: 'var(--success)' }}>{moeda(d.receber_7d)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0' }}>
                <span>A pagar</span>
                <span style={{ fontWeight: 600, color: 'var(--danger)' }}>{moeda(d.pagar_7d)}</span>
              </div>
              {Number(d.atrasados) > 0 && (
                <div className="badge badge-danger" style={{ marginTop: 8 }}>
                  {d.atrasados} {Number(d.atrasados) === 1 ? 'lançamento atrasado' : 'lançamentos atrasados'}
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <Link to="/fluxo-caixa" style={{ fontSize: 13 }}>Ver fluxo de caixa →</Link>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) { .dash-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  )
}

function Kpi({ titulo, valor, anterior, rotuloAnterior, carregando }) {
  const v = Number(valor) || 0
  const a = Number(anterior) || 0
  const variacao = a > 0 ? ((v - a) / a) * 100 : null
  const subiu = variacao != null && variacao > 0.5
  const caiu = variacao != null && variacao < -0.5

  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="kpi-label">{titulo}</div>
      {carregando ? (
        <div className="skeleton" style={{ height: 26, marginTop: 8, width: 110 }} />
      ) : (
        <>
          <div style={{ fontSize: 23, fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: 6 }}>
            {moeda(v)}
          </div>
          <div style={{
            fontSize: 12, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4,
            color: subiu ? 'var(--success)' : caiu ? 'var(--danger)' : 'var(--text-muted)',
          }}>
            {subiu && <TrendingUp size={13} />}
            {caiu && <TrendingDown size={13} />}
            {!subiu && !caiu && <Minus size={13} />}
            {variacao == null ? `— ${rotuloAnterior}` : `${variacao > 0 ? '+' : ''}${variacao.toFixed(0)}% ${rotuloAnterior}`}
          </div>
        </>
      )}
    </div>
  )
}

function GraficoBarras({ dados }) {
  const max = Math.max(...dados.map((x) => Number(x.total)), 1)
  const W = 600, H = 130, gap = 3
  const bw = (W - gap * (dados.length - 1)) / dados.length

  const fmtDia = (iso) => {
    const [, m, dd] = iso.split('-')
    return `${dd}/${m}`
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Vendas por dia nos últimos 30 dias">
      {dados.map((x, i) => {
        const total = Number(x.total)
        const h = total > 0 ? Math.max((total / max) * (H - 8), 3) : 2
        return (
          <g key={x.dia}>
            <rect
              x={i * (bw + gap)} y={H - h} width={bw} height={h} rx={2.5}
              fill={total > 0 ? 'var(--accent)' : 'var(--border)'}
              opacity={total > 0 ? 0.85 : 0.6}
            >
              <title>{fmtDia(x.dia)}: {moeda(total)}</title>
            </rect>
          </g>
        )
      })}
    </svg>
  )
}
