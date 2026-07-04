import { useEffect, useState, useCallback } from 'react'
import { Plus, Check, Trash2, RotateCcw, MessageCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../hooks/usePermissions'
import { moeda } from '../lib/formatos'

const FORMAS = ['dinheiro', 'pix', 'debito', 'credito', 'boleto', 'transferencia']
const FORMA_NOME = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Débito', credito: 'Crédito', boleto: 'Boleto', transferencia: 'Transferência' }

const hojeISO = () => new Date().toISOString().slice(0, 10)
const mesAtual = () => new Date().toISOString().slice(0, 7) // YYYY-MM

const dataBR = (iso) => {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

export default function Lancamentos({ tipo }) {
  const receita = tipo === 'receita'
  const titulo = receita ? 'Contas a receber' : 'Contas a pagar'
  const { empresa, profile } = useAuth()
  const { can } = usePermissions()

  const [lista, setLista] = useState(null)
  const [categorias, setCategorias] = useState([])
  const [mes, setMes] = useState(mesAtual())
  const [filtroStatus, setFiltroStatus] = useState('abertos')
  const [modal, setModal] = useState(false)

  const carregar = useCallback(async () => {
    const inicio = `${mes}-01`
    const fim = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).toISOString().slice(0, 10)

    let q = supabase
      .from('lancamentos')
      .select('id, descricao, valor, vencimento, status, pago_em, forma_pagamento, venda_id, categorias_financeiras(nome)')
      .eq('empresa_id', empresa.id)
      .eq('tipo', tipo)
      .gte('vencimento', inicio)
      .lte('vencimento', fim)
      .order('vencimento')

    if (filtroStatus === 'abertos') q = q.eq('status', 'aberto')
    if (filtroStatus === 'pagos') q = q.eq('status', 'pago')

    const { data } = await q
    setLista(data ?? [])
  }, [empresa.id, tipo, mes, filtroStatus])

  useEffect(() => { setLista(null); carregar() }, [carregar])

  useEffect(() => {
    supabase.from('categorias_financeiras')
      .select('id, nome')
      .eq('empresa_id', empresa.id).eq('tipo', tipo).order('nome')
      .then(({ data }) => setCategorias(data ?? []))
  }, [empresa.id, tipo])

  const marcarPago = async (l) => {
    await supabase.from('lancamentos')
      .update({ status: 'pago', pago_em: new Date().toISOString() })
      .eq('id', l.id)
    carregar()
  }

  const reabrir = async (l) => {
    await supabase.from('lancamentos')
      .update({ status: 'aberto', pago_em: null })
      .eq('id', l.id)
    carregar()
  }

  const excluir = async (l) => {
    if (!window.confirm(`Excluir "${l.descricao}"?`)) return
    await supabase.from('lancamentos').delete().eq('id', l.id)
    carregar()
  }

  const hoje = hojeISO()
  const totalAberto = (lista ?? []).filter((l) => l.status === 'aberto').reduce((s, l) => s + Number(l.valor), 0)
  const totalPago = (lista ?? []).filter((l) => l.status === 'pago').reduce((s, l) => s + Number(l.valor), 0)
  const totalAtrasado = (lista ?? []).filter((l) => l.status === 'aberto' && l.vencimento < hoje).reduce((s, l) => s + Number(l.valor), 0)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{titulo}</h1>
          <p className="page-sub">
            {receita
              ? 'Vendas no crédito entram aqui automaticamente, com vencimento em 30 dias.'
              : 'Despesas, fornecedores e contas fixas — com parcelamento em um clique.'}
          </p>
        </div>
        {can('financeiro', 'criar') && (
          <button className="btn btn-primary" onClick={() => setModal(true)}>
            <Plus size={15} /> Novo lançamento
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 18 }}>
        <CardResumo titulo={receita ? 'A receber no mês' : 'A pagar no mês'} valor={totalAberto} cor="var(--text)" />
        <CardResumo titulo="Atrasado" valor={totalAtrasado} cor={totalAtrasado > 0 ? 'var(--danger)' : 'var(--text-muted)'} />
        <CardResumo titulo={receita ? 'Recebido no mês' : 'Pago no mês'} valor={totalPago} cor="var(--success)" />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input type="month" className="input" style={{ width: 170 }} value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês" />
        <select className="select" style={{ width: 150 }} value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
          <option value="abertos">Em aberto</option>
          <option value="pagos">{receita ? 'Recebidos' : 'Pagos'}</option>
          <option value="todos">Todos</option>
        </select>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {lista === null ? (
          <div style={{ padding: 16 }}>
            {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 44, marginBottom: 8 }} />)}
          </div>
        ) : lista.length === 0 ? (
          <div className="empty">
            <strong>Nada por aqui neste mês</strong>
            {receita ? 'Lançamentos de vendas no crédito e outras receitas aparecem aqui.' : 'Cadastre a primeira despesa no botão acima.'}
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Vencimento</th>
                <th>Descrição</th>
                <th>Categoria</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((l) => {
                const atrasado = l.status === 'aberto' && l.vencimento < hoje
                return (
                  <tr key={l.id} style={{ opacity: l.status === 'cancelado' ? 0.5 : 1 }}>
                    <td style={{ whiteSpace: 'nowrap', color: atrasado ? 'var(--danger)' : 'var(--text-muted)', fontWeight: atrasado ? 600 : 400 }}>
                      {dataBR(l.vencimento)}
                    </td>
                    <td style={{ fontWeight: 500 }}>
                      {l.descricao}
                      {l.venda_id && <span className="badge badge-accent" style={{ marginLeft: 8 }}>venda</span>}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{l.categorias_financeiras?.nome || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{moeda(l.valor)}</td>
                    <td>
                      {l.status === 'pago' && <span className="badge badge-success">{receita ? 'Recebido' : 'Pago'}</span>}
                      {l.status === 'cancelado' && <span className="badge badge-muted">Cancelado</span>}
                      {l.status === 'aberto' && (atrasado
                        ? <span className="badge badge-danger">Atrasado</span>
                        : <span className="badge badge-warn">Em aberto</span>)}
                    </td>
                    <td style={{ width: 1, whiteSpace: 'nowrap' }}>
                      {receita && l.status === 'aberto' && (
                        <a
                          className="icon-btn"
                          style={{ display: 'inline-grid', verticalAlign: 'middle' }}
                          href={`https://wa.me/?text=${encodeURIComponent(
                            `Olá! Passando para lembrar do pagamento de *${l.descricao}* no valor de ${moeda(l.valor)}, com vencimento em ${dataBR(l.vencimento)}. Qualquer dúvida estou à disposição!`
                          )}`}
                          target="_blank" rel="noreferrer"
                          aria-label="Cobrar por WhatsApp"
                          title="Cobrar por WhatsApp"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MessageCircle size={15} />
                        </a>
                      )}{' '}
                      {can('financeiro', 'editar') && l.status === 'aberto' && (
                        <button className="btn btn-ghost" onClick={() => marcarPago(l)}>
                          <Check size={14} /> {receita ? 'Receber' : 'Pagar'}
                        </button>
                      )}
                      {can('financeiro', 'editar') && l.status === 'pago' && !l.venda_id && (
                        <button className="icon-btn" onClick={() => reabrir(l)} aria-label="Reabrir">
                          <RotateCcw size={15} />
                        </button>
                      )}
                      {can('financeiro', 'excluir') && !l.venda_id && (
                        <button className="icon-btn" onClick={() => excluir(l)} aria-label="Excluir">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <ModalLancamento
          tipo={tipo}
          categorias={categorias}
          empresa={empresa}
          profile={profile}
          onClose={() => setModal(false)}
          onSalvo={() => { setModal(false); carregar() }}
        />
      )}
    </div>
  )
}

function CardResumo({ titulo, valor, cor }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="kpi-label">
        {titulo}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: 6, color: cor }}>
        {moeda(valor)}
      </div>
    </div>
  )
}

function ModalLancamento({ tipo, categorias, empresa, profile, onClose, onSalvo }) {
  const receita = tipo === 'receita'
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [categoria, setCategoria] = useState('')
  const [vencimento, setVencimento] = useState(hojeISO())
  const [parcelas, setParcelas] = useState(1)
  const [jaPago, setJaPago] = useState(false)
  const [forma, setForma] = useState('pix')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const salvar = async () => {
    setErro('')
    if (!descricao.trim()) { setErro('Informe a descrição'); return }
    const v = Number(valor)
    if (!v || v <= 0) { setErro('Informe o valor'); return }
    const n = Math.max(1, Math.min(48, Number(parcelas) || 1))
    setSalvando(true)

    const valorParcela = Math.round((v / n) * 100) / 100
    const base = new Date(vencimento + 'T12:00:00')
    const rows = []
    let acumulado = 0
    for (let i = 0; i < n; i++) {
      const venc = new Date(base)
      venc.setMonth(venc.getMonth() + i)
      // Última parcela absorve o resto da divisão (centavos)
      const vp = i === n - 1 ? Math.round((v - acumulado) * 100) / 100 : valorParcela
      acumulado += vp
      rows.push({
        empresa_id: empresa.id,
        tipo,
        descricao: n > 1 ? `${descricao.trim()} (${i + 1}/${n})` : descricao.trim(),
        categoria_id: categoria || null,
        valor: vp,
        vencimento: venc.toISOString().slice(0, 10),
        status: jaPago && i === 0 ? 'pago' : 'aberto',
        pago_em: jaPago && i === 0 ? new Date().toISOString() : null,
        forma_pagamento: jaPago && i === 0 ? forma : null,
        criado_por: profile.id,
      })
    }

    const { error } = await supabase.from('lancamentos').insert(rows)
    setSalvando(false)
    if (error) { setErro(error.message); return }
    onSalvo()
  }

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" style={{ padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>
          {receita ? 'Nova receita' : 'Nova despesa'}
        </h2>

        <div className="field">
          <label className="label" htmlFor="ln-desc">Descrição</label>
          <input id="ln-desc" className="input" autoFocus value={descricao} onChange={(e) => setDescricao(e.target.value)}
            placeholder={receita ? 'Serviço de banho e tosa' : 'Aluguel da loja'} />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label className="label" htmlFor="ln-valor">Valor total (R$)</label>
            <input id="ln-valor" className="input" type="number" min="0" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label className="label" htmlFor="ln-venc">1º vencimento</label>
            <input id="ln-venc" className="input" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </div>
          <div className="field" style={{ flex: '0 0 110px' }}>
            <label className="label" htmlFor="ln-parc">Parcelas</label>
            <input id="ln-parc" className="input" type="number" min="1" max="48" value={parcelas} onChange={(e) => setParcelas(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="ln-cat">Categoria</label>
          <select id="ln-cat" className="select" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Sem categoria</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>

        {Number(parcelas) <= 1 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', marginBottom: 14 }}>
            <input type="checkbox" className="perm-check" checked={jaPago} onChange={(e) => setJaPago(e.target.checked)} />
            {receita ? 'Já recebi este valor' : 'Já paguei este valor'}
          </label>
        )}

        {jaPago && Number(parcelas) <= 1 && (
          <div className="field">
            <label className="label" htmlFor="ln-forma">Forma</label>
            <select id="ln-forma" className="select" value={forma} onChange={(e) => setForma(e.target.value)}>
              {FORMAS.map((f) => <option key={f} value={f}>{FORMA_NOME[f]}</option>)}
            </select>
          </div>
        )}

        {Number(parcelas) > 1 && Number(valor) > 0 && (
          <div className="badge badge-accent" style={{ marginBottom: 14 }}>
            {parcelas}× de {moeda(Number(valor) / Number(parcelas))} — a última ajusta os centavos
          </div>
        )}

        {erro && <div className="badge badge-danger" style={{ marginBottom: 12 }}>{erro}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
