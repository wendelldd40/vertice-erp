import { useEffect, useState, useCallback } from 'react'
import { Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { moeda, numero, dataHora } from '../lib/formatos'
import { baixarCSV } from '../lib/csv'

const FORMA_NOME = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Débito', credito: 'Crédito' }

const primeiroDiaMes = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
const hojeISO = () => new Date().toISOString().slice(0, 10)
const dataBR = (iso) => iso.split('-').reverse().join('/')

export default function Relatorios() {
  const [aba, setAba] = useState('vendas')
  const [inicio, setInicio] = useState(primeiroDiaMes())
  const [fim, setFim] = useState(hojeISO())

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Relatórios</h1>
          <p className="page-sub">Exportação em CSV pronta para abrir no Excel.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {[['vendas', 'Vendas'], ['abc', 'Curva ABC'], ['estoque', 'Estoque']].map(([id, nome]) => (
          <button key={id} className={`btn ${aba === id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAba(id)}>
            {nome}
          </button>
        ))}
        {aba !== 'estoque' && (
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
            <input type="date" className="input" style={{ width: 150 }} value={inicio} onChange={(e) => setInicio(e.target.value)} aria-label="Data inicial" />
            <span style={{ color: 'var(--text-faint)' }}>até</span>
            <input type="date" className="input" style={{ width: 150 }} value={fim} onChange={(e) => setFim(e.target.value)} aria-label="Data final" />
          </div>
        )}
      </div>

      {aba === 'vendas' && <RelVendas inicio={inicio} fim={fim} />}
      {aba === 'abc' && <RelABC inicio={inicio} fim={fim} />}
      {aba === 'estoque' && <RelEstoque />}
    </div>
  )
}

/* ---------------- VENDAS ---------------- */
function RelVendas({ inicio, fim }) {
  const [d, setD] = useState(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setD(null)
    const { data, error } = await supabase.rpc('relatorio_vendas', { p_inicio: inicio, p_fim: fim })
    if (error) { setErro(error.message); return }
    setD(data)
  }, [inicio, fim])

  useEffect(() => { carregar() }, [carregar])

  if (erro) return <AvisoMigration erro={erro} />

  const exportar = () => baixarCSV(
    `vendas_${inicio}_a_${fim}.csv`,
    [
      { campo: 'dia', titulo: 'Dia' },
      { campo: 'qtd', titulo: 'Vendas' },
      { campo: 'total', titulo: 'Faturamento (R$)' },
    ],
    (d.por_dia ?? []).map((x) => ({ dia: dataBR(x.dia), qtd: Number(x.qtd), total: Number(x.total) }))
  )

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
        <Kpi titulo="Faturamento" valor={d && moeda(d.faturamento)} />
        <Kpi titulo="Vendas" valor={d && String(d.qtd_vendas)} />
        <Kpi titulo="Ticket médio" valor={d && moeda(d.ticket_medio)} />
        <Kpi titulo="Descontos dados" valor={d && moeda(d.descontos)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 18 }}>
        <Tabela
          titulo="Por forma de pagamento"
          colunas={['Forma', 'Vendas', 'Total']}
          linhas={(d?.por_forma ?? []).map((x) => [FORMA_NOME[x.forma] ?? x.forma, x.qtd, moeda(x.total)])}
          carregando={!d}
        />
        <Tabela
          titulo="Por vendedor"
          colunas={['Vendedor', 'Vendas', 'Total']}
          linhas={(d?.por_vendedor ?? []).map((x) => [x.vendedor, x.qtd, moeda(x.total)])}
          carregando={!d}
        />
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>Vendas por dia</span>
          {d && d.por_dia.length > 0 && (
            <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={exportar}>
              <Download size={14} /> Exportar CSV
            </button>
          )}
        </div>
        {!d ? (
          <div style={{ padding: 16 }}><div className="skeleton" style={{ height: 120 }} /></div>
        ) : d.por_dia.length === 0 ? (
          <div className="empty"><strong>Sem vendas no período</strong>Ajuste as datas acima.</div>
        ) : (
          <table className="table">
            <thead><tr><th>Dia</th><th style={{ textAlign: 'right' }}>Vendas</th><th style={{ textAlign: 'right' }}>Faturamento</th></tr></thead>
            <tbody>
              {d.por_dia.map((x) => (
                <tr key={x.dia}>
                  <td>{dataBR(x.dia)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{x.qtd}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{moeda(x.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

/* ---------------- CURVA ABC ---------------- */
function RelABC({ inicio, fim }) {
  const [lista, setLista] = useState(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setLista(null)
    const { data, error } = await supabase.rpc('relatorio_abc', { p_inicio: inicio, p_fim: fim })
    if (error) { setErro(error.message); return }
    setLista(data ?? [])
  }, [inicio, fim])

  useEffect(() => { carregar() }, [carregar])

  if (erro) return <AvisoMigration erro={erro} />

  const badgeClasse = { A: 'badge-success', B: 'badge-warn', C: 'badge-muted' }
  const resumo = (classe) => (lista ?? []).filter((x) => x.classe === classe)

  const exportar = () => baixarCSV(
    `curva_abc_${inicio}_a_${fim}.csv`,
    [
      { campo: 'classe', titulo: 'Classe' },
      { campo: 'nome', titulo: 'Produto' },
      { campo: 'quantidade', titulo: 'Qtd. vendida' },
      { campo: 'total', titulo: 'Faturamento (R$)' },
      { campo: 'pct', titulo: '% do faturamento' },
    ],
    lista.map((x) => ({ ...x, quantidade: Number(x.quantidade), total: Number(x.total), pct: Number(x.pct) }))
  )

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
        <Kpi titulo="Classe A (até 80% do fat.)" valor={lista && `${resumo('A').length} produtos`} />
        <Kpi titulo="Classe B (80–95%)" valor={lista && `${resumo('B').length} produtos`} />
        <Kpi titulo="Classe C (cauda)" valor={lista && `${resumo('C').length} produtos`} />
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 600 }}>Curva ABC de produtos</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Classe A merece estoque garantido; classe C merece revisão de mix.
            </div>
          </div>
          {lista && lista.length > 0 && (
            <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={exportar}>
              <Download size={14} /> Exportar CSV
            </button>
          )}
        </div>
        {!lista ? (
          <div style={{ padding: 16 }}><div className="skeleton" style={{ height: 140 }} /></div>
        ) : lista.length === 0 ? (
          <div className="empty"><strong>Sem vendas no período</strong>A curva ABC nasce das vendas registradas.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>Classe</th>
                <th>Produto</th>
                <th style={{ textAlign: 'right' }}>Qtd.</th>
                <th style={{ textAlign: 'right' }}>Faturamento</th>
                <th style={{ textAlign: 'right' }}>% do total</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((x) => (
                <tr key={x.nome}>
                  <td><span className={`badge ${badgeClasse[x.classe]}`}>{x.classe}</span></td>
                  <td style={{ fontWeight: 500 }}>{x.nome}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{numero(x.quantidade)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{moeda(x.total)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{Number(x.pct).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

/* ---------------- ESTOQUE ---------------- */
function RelEstoque() {
  const [d, setD] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    supabase.rpc('relatorio_estoque').then(({ data, error }) => {
      if (error) { setErro(error.message); return }
      setD(data)
    })
  }, [])

  if (erro) return <AvisoMigration erro={erro} />

  const exportar = () => baixarCSV(
    'produtos_parados.csv',
    [
      { campo: 'nome', titulo: 'Produto' },
      { campo: 'saldo', titulo: 'Saldo' },
      { campo: 'valor_parado', titulo: 'Valor parado (R$ custo)' },
      { campo: 'ultima_venda', titulo: 'Última venda' },
    ],
    d.parados.map((x) => ({
      ...x, saldo: Number(x.saldo), valor_parado: Number(x.valor_parado),
      ultima_venda: x.ultima_venda ? dataHora(x.ultima_venda) : 'Nunca',
    }))
  )

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 18 }}>
        <Kpi titulo="Valor do estoque (custo)" valor={d && moeda(d.valor_custo)} />
        <Kpi titulo="Valor do estoque (venda)" valor={d && moeda(d.valor_venda)} />
        <Kpi titulo="Lucro potencial" valor={d && moeda(Number(d.valor_venda) - Number(d.valor_custo))} />
        <Kpi titulo="Itens em estoque" valor={d && numero(d.itens_em_estoque)} />
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 600 }}>Produtos parados</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Com saldo em estoque e sem nenhuma venda há 30+ dias — dinheiro dormindo na prateleira.
            </div>
          </div>
          {d && d.parados.length > 0 && (
            <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={exportar}>
              <Download size={14} /> Exportar CSV
            </button>
          )}
        </div>
        {!d ? (
          <div style={{ padding: 16 }}><div className="skeleton" style={{ height: 100 }} /></div>
        ) : d.parados.length === 0 ? (
          <div className="empty"><strong>Nenhum produto parado</strong>Todo o estoque com saldo teve giro nos últimos 30 dias. 👏</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Produto</th>
                <th style={{ textAlign: 'right' }}>Saldo</th>
                <th style={{ textAlign: 'right' }}>Valor parado</th>
                <th>Última venda</th>
              </tr>
            </thead>
            <tbody>
              {d.parados.map((x) => (
                <tr key={x.nome}>
                  <td style={{ fontWeight: 500 }}>{x.nome}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{numero(x.saldo)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--warn)' }}>{moeda(x.valor_parado)}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{x.ultima_venda ? dataHora(x.ultima_venda) : 'Nunca vendeu'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

/* ---------------- auxiliares ---------------- */
function Kpi({ titulo, valor }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="kpi-label">
        {titulo}
      </div>
      {valor == null ? (
        <div className="skeleton" style={{ height: 24, marginTop: 8, width: 90 }} />
      ) : (
        <div style={{ fontSize: 19, fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: 6 }}>{valor}</div>
      )}
    </div>
  )
}

function Tabela({ titulo, colunas, linhas, carregando }) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{titulo}</div>
      {carregando ? (
        <div style={{ padding: 16 }}><div className="skeleton" style={{ height: 70 }} /></div>
      ) : linhas.length === 0 ? (
        <div className="empty" style={{ padding: '24px 16px' }}>Sem dados no período.</div>
      ) : (
        <table className="table">
          <thead><tr>{colunas.map((c, i) => <th key={c} style={i > 0 ? { textAlign: 'right' } : {}}>{c}</th>)}</tr></thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i}>
                {l.map((v, j) => (
                  <td key={j} style={j > 0 ? { textAlign: 'right', fontWeight: j === l.length - 1 ? 600 : 400, color: j === l.length - 1 ? 'inherit' : 'var(--text-muted)' } : { fontWeight: 500 }}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function AvisoMigration({ erro }) {
  return (
    <div className="badge badge-warn">
      {erro.includes('function') ? 'Execute a migration 008_relatorios.sql no Supabase para ativar os relatórios.' : erro}
    </div>
  )
}
