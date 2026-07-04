import { useEffect, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { moeda } from '../lib/formatos'

const mesAtual = () => new Date().toISOString().slice(0, 7)

const nomeMes = (ym) => {
  const [a, m] = ym.split('-')
  return new Date(Number(a), Number(m) - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

const somarMes = (ym, delta) => {
  const [a, m] = ym.split('-').map(Number)
  const d = new Date(a, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function FluxoCaixa() {
  const { empresa } = useAuth()
  const [mes, setMes] = useState(mesAtual())
  const [regime, setRegime] = useState('realizado') // realizado | previsto
  const [dados, setDados] = useState(null)

  const carregar = useCallback(async () => {
    const inicio = `${mes}-01`
    const fim = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).toISOString().slice(0, 10)

    // Realizado: pago dentro do mês. Previsto: vence no mês (pago ou não), exceto cancelados.
    let q = supabase
      .from('lancamentos')
      .select('tipo, valor, status, vencimento, pago_em, categorias_financeiras(nome)')
      .eq('empresa_id', empresa.id)
      .neq('status', 'cancelado')

    if (regime === 'realizado') {
      q = q.eq('status', 'pago').gte('pago_em', inicio).lte('pago_em', fim + 'T23:59:59')
    } else {
      q = q.gte('vencimento', inicio).lte('vencimento', fim)
    }

    const { data } = await q
    setDados(data ?? [])
  }, [empresa.id, mes, regime])

  useEffect(() => { setDados(null); carregar() }, [carregar])

  const entradas = (dados ?? []).filter((l) => l.tipo === 'receita').reduce((s, l) => s + Number(l.valor), 0)
  const saidas = (dados ?? []).filter((l) => l.tipo === 'despesa').reduce((s, l) => s + Number(l.valor), 0)
  const resultado = entradas - saidas

  const porCategoria = (tipo) => {
    const mapa = {}
    for (const l of (dados ?? []).filter((x) => x.tipo === tipo)) {
      const nome = l.categorias_financeiras?.nome || 'Sem categoria'
      mapa[nome] = (mapa[nome] || 0) + Number(l.valor)
    }
    return Object.entries(mapa).sort((a, b) => b[1] - a[1])
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Fluxo de caixa</h1>
          <p className="page-sub">
            Realizado é o que de fato entrou e saiu. Previsto é o que vence no mês — a diferença entre saber e achar.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="icon-btn" onClick={() => setMes((m) => somarMes(m, -1))} aria-label="Mês anterior">
            <ChevronLeft size={17} />
          </button>
          <span style={{ fontWeight: 600, minWidth: 150, textAlign: 'center', textTransform: 'capitalize' }}>
            {nomeMes(mes)}
          </span>
          <button className="icon-btn" onClick={() => setMes((m) => somarMes(m, 1))} aria-label="Próximo mês">
            <ChevronRight size={17} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn ${regime === 'realizado' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setRegime('realizado')}>
            Realizado
          </button>
          <button className={`btn ${regime === 'previsto' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setRegime('previsto')}>
            Previsto
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 20 }}>
        <Kpi titulo="Entradas" valor={entradas} cor="var(--success)" carregando={dados === null} />
        <Kpi titulo="Saídas" valor={saidas} cor="var(--danger)" carregando={dados === null} />
        <Kpi
          titulo="Resultado"
          valor={resultado}
          cor={resultado >= 0 ? 'var(--success)' : 'var(--danger)'}
          carregando={dados === null}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <BlocoCategorias titulo="Entradas por categoria" itens={porCategoria('receita')} cor="var(--success)" carregando={dados === null} />
        <BlocoCategorias titulo="Saídas por categoria" itens={porCategoria('despesa')} cor="var(--danger)" carregando={dados === null} />
      </div>
    </div>
  )
}

function Kpi({ titulo, valor, cor, carregando }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="kpi-label">
        {titulo}
      </div>
      {carregando ? (
        <div className="skeleton" style={{ height: 28, marginTop: 8, width: 110 }} />
      ) : (
        <div style={{ fontSize: 23, fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: 6, color: cor }}>
          {moeda(valor)}
        </div>
      )}
    </div>
  )
}

function BlocoCategorias({ titulo, itens, cor, carregando }) {
  const max = itens.length ? itens[0][1] : 0
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ fontWeight: 600, marginBottom: 14 }}>{titulo}</div>
      {carregando ? (
        [1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 30, marginBottom: 10 }} />)
      ) : itens.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sem movimentos neste mês.</div>
      ) : (
        itens.map(([nome, valor]) => (
          <div key={nome} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span>{nome}</span>
              <span style={{ fontWeight: 600 }}>{moeda(valor)}</span>
            </div>
            <div style={{ height: 7, borderRadius: 99, background: 'var(--surface-2)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 99, background: cor, opacity: 0.75,
                width: `${max ? Math.max((valor / max) * 100, 3) : 0}%`,
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        ))
      )}
    </div>
  )
}
