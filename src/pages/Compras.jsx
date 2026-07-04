import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Plus, PackageCheck, XCircle, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../hooks/usePermissions'
import { moeda, numero, dataHora } from '../lib/formatos'

const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export default function Compras() {
  const { empresa } = useAuth()
  const { can } = usePermissions()

  const [lista, setLista] = useState(null)
  const [aberta, setAberta] = useState(null)
  const [itens, setItens] = useState({})
  const [nova, setNova] = useState(false)
  const [receber, setReceber] = useState(null) // compra a receber

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('compras')
      .select('id, numero, total, status, observacoes, criado_em, recebido_em, fornecedores(nome)')
      .eq('empresa_id', empresa.id)
      .order('criado_em', { ascending: false })
      .limit(60)
    setLista(data ?? [])
  }, [empresa.id])

  useEffect(() => { carregar() }, [carregar])

  const abrir = async (compra) => {
    if (aberta === compra.id) { setAberta(null); return }
    setAberta(compra.id)
    if (!itens[compra.id]) {
      const { data } = await supabase
        .from('compra_itens')
        .select('id, produto_nome, quantidade, custo_unitario, total')
        .eq('compra_id', compra.id)
      setItens((c) => ({ ...c, [compra.id]: data ?? [] }))
    }
  }

  const cancelar = async (compra) => {
    if (!window.confirm(`Cancelar a compra #${compra.numero}?`)) return
    const { error } = await supabase.rpc('cancelar_compra', { p_compra: compra.id })
    if (error) { alert(error.message); return }
    carregar()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Compras</h1>
          <p className="page-sub">
            Receber uma compra dá entrada no estoque, atualiza o custo dos produtos e gera a conta a pagar — tudo de uma vez.
          </p>
        </div>
        {can('compras', 'criar') && (
          <button className="btn btn-primary" onClick={() => setNova(true)}>
            <Plus size={15} /> Nova compra
          </button>
        )}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {lista === null ? (
          <div style={{ padding: 16 }}>
            {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 44, marginBottom: 8 }} />)}
          </div>
        ) : lista.length === 0 ? (
          <div className="empty">
            <strong>Nenhuma compra registrada</strong>
            Crie o primeiro pedido de compra no botão acima.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Criada em</th>
                <th>Fornecedor</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <LinhaCompra
                  key={c.id}
                  compra={c}
                  aberta={aberta === c.id}
                  itens={itens[c.id]}
                  onAbrir={() => abrir(c)}
                  onReceber={can('compras', 'editar') && c.status === 'pendente' ? () => setReceber(c) : null}
                  onCancelar={can('compras', 'excluir') && c.status === 'pendente' ? () => cancelar(c) : null}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {nova && (
        <ModalNovaCompra
          onClose={() => setNova(false)}
          onSalvo={() => { setNova(false); carregar() }}
        />
      )}

      {receber && (
        <ModalReceber
          compra={receber}
          onClose={() => setReceber(null)}
          onRecebida={() => { setReceber(null); setItens({}); carregar() }}
        />
      )}
    </div>
  )
}

function LinhaCompra({ compra, aberta, itens, onAbrir, onReceber, onCancelar }) {
  const badge = compra.status === 'recebida' ? 'badge-success' : compra.status === 'cancelada' ? 'badge-muted' : 'badge-warn'
  const rotulo = compra.status === 'recebida' ? 'Recebida' : compra.status === 'cancelada' ? 'Cancelada' : 'Pendente'
  return (
    <>
      <tr style={{ cursor: 'pointer', opacity: compra.status === 'cancelada' ? 0.55 : 1 }} onClick={onAbrir}>
        <td style={{ fontWeight: 600 }}>#{compra.numero}</td>
        <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{dataHora(compra.criado_em)}</td>
        <td>{compra.fornecedores?.nome || <span style={{ color: 'var(--text-faint)' }}>—</span>}</td>
        <td style={{ textAlign: 'right', fontWeight: 600 }}>{moeda(compra.total)}</td>
        <td><span className={`badge ${badge}`}>{rotulo}</span></td>
        <td style={{ width: 1, whiteSpace: 'nowrap' }}>
          {onReceber && (
            <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); onReceber() }}>
              <PackageCheck size={14} /> Receber
            </button>
          )}{' '}
          {onCancelar && (
            <button className="icon-btn" onClick={(e) => { e.stopPropagation(); onCancelar() }} aria-label="Cancelar compra">
              <XCircle size={16} />
            </button>
          )}
        </td>
      </tr>
      {aberta && (
        <tr>
          <td colSpan={6} style={{ background: 'var(--surface-2)', padding: '10px 16px' }}>
            {!itens ? (
              <div className="skeleton" style={{ height: 32 }} />
            ) : (
              <div style={{ fontSize: 13 }}>
                {itens.map((i) => (
                  <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span>{numero(i.quantidade)}× {i.produto_nome} <span style={{ color: 'var(--text-faint)' }}>({moeda(i.custo_unitario)} un.)</span></span>
                    <span style={{ fontWeight: 600 }}>{moeda(i.total)}</span>
                  </div>
                ))}
                {compra.observacoes && (
                  <div style={{ color: 'var(--text-faint)', marginTop: 6 }}>Obs.: {compra.observacoes}</div>
                )}
                {compra.recebido_em && (
                  <div style={{ color: 'var(--text-faint)', marginTop: 6 }}>Recebida em {dataHora(compra.recebido_em)}</div>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function ModalNovaCompra({ onClose, onSalvo }) {
  const { empresa } = useAuth()
  const [produtos, setProdutos] = useState([])
  const [fornecedores, setFornecedores] = useState([])
  const [fornecedor, setFornecedor] = useState('')
  const [busca, setBusca] = useState('')
  const [selecionado, setSelecionado] = useState(0)
  const [carrinho, setCarrinho] = useState([])
  const [observacoes, setObservacoes] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const buscaRef = useRef(null)

  useEffect(() => {
    supabase.from('produtos').select('id, nome, sku, preco_custo')
      .eq('empresa_id', empresa.id).eq('ativo', true).order('nome')
      .then(({ data }) => setProdutos(data ?? []))
    supabase.from('fornecedores').select('id, nome')
      .eq('empresa_id', empresa.id).eq('ativo', true).order('nome')
      .then(({ data }) => setFornecedores(data ?? []))
  }, [empresa.id])

  const resultados = useMemo(() => {
    if (!busca.trim()) return []
    const q = norm(busca)
    return produtos
      .filter((p) => norm(p.nome).includes(q) || (p.sku && norm(p.sku).includes(q)))
      .filter((p) => !carrinho.some((i) => i.produto_id === p.id))
      .slice(0, 6)
  }, [busca, produtos, carrinho])

  useEffect(() => setSelecionado(0), [busca])

  const adicionar = (p) => {
    if (!p) return
    setCarrinho((c) => [...c, {
      produto_id: p.id, nome: p.nome,
      quantidade: 1, custo_unitario: Number(p.preco_custo) || 0,
    }])
    setBusca('')
    buscaRef.current?.focus()
  }

  const alterar = (produto_id, campo, valor) => {
    setCarrinho((c) => c.map((i) => (i.produto_id === produto_id ? { ...i, [campo]: valor } : i)))
  }

  const total = carrinho.reduce((s, i) => s + (Number(i.quantidade) || 0) * (Number(i.custo_unitario) || 0), 0)

  const salvar = async () => {
    setErro('')
    if (carrinho.length === 0) { setErro('Adicione ao menos um item'); return }
    setSalvando(true)
    const { error } = await supabase.rpc('criar_compra', {
      p_itens: carrinho.map((i) => ({
        produto_id: i.produto_id,
        quantidade: Number(i.quantidade),
        custo_unitario: Number(i.custo_unitario),
      })),
      p_fornecedor: fornecedor || null,
      p_observacoes: observacoes || null,
    })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    onSalvo()
  }

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" style={{ padding: 22, width: 'min(640px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>Nova compra</h2>

        <div className="field">
          <label className="label" htmlFor="cp-forn">Fornecedor <span style={{ color: 'var(--text-faint)' }}>(opcional)</span></label>
          <select id="cp-forn" className="select" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)}>
            <option value="">Sem fornecedor</option>
            {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </div>

        <div className="field" style={{ position: 'relative' }}>
          <label className="label" htmlFor="cp-busca">Adicionar produto</label>
          <input
            id="cp-busca" ref={buscaRef} className="input" autoFocus
            placeholder="Nome ou SKU…" value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); adicionar(resultados[selecionado]) }
              if (e.key === 'ArrowDown') { e.preventDefault(); setSelecionado((s) => Math.min(s + 1, resultados.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSelecionado((s) => Math.max(s - 1, 0)) }
            }}
            autoComplete="off"
          />
          {resultados.length > 0 && (
            <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, padding: 6, marginTop: 4 }}>
              {resultados.map((p, i) => (
                <div key={p.id} className={`palette-item ${i === selecionado ? 'selected' : ''}`}
                  onMouseEnter={() => setSelecionado(i)} onClick={() => adicionar(p)}>
                  {p.nome}
                  <span className="group">custo atual {moeda(p.preco_custo)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {carrinho.length > 0 && (
          <div className="card" style={{ marginBottom: 14, boxShadow: 'none', overflow: 'hidden' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th style={{ width: 84 }}>Qtd.</th>
                  <th style={{ width: 110 }}>Custo un.</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {carrinho.map((i) => (
                  <tr key={i.produto_id}>
                    <td style={{ fontWeight: 500 }}>{i.nome}</td>
                    <td>
                      <input className="input" type="number" min="0.001" step="any" style={{ padding: '5px 8px' }}
                        value={i.quantidade} onChange={(e) => alterar(i.produto_id, 'quantidade', e.target.value)}
                        aria-label={`Quantidade de ${i.nome}`} />
                    </td>
                    <td>
                      <input className="input" type="number" min="0" step="0.01" style={{ padding: '5px 8px' }}
                        value={i.custo_unitario} onChange={(e) => alterar(i.produto_id, 'custo_unitario', e.target.value)}
                        aria-label={`Custo de ${i.nome}`} />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {moeda((Number(i.quantidade) || 0) * (Number(i.custo_unitario) || 0))}
                    </td>
                    <td>
                      <button className="icon-btn" onClick={() => setCarrinho((c) => c.filter((x) => x.produto_id !== i.produto_id))} aria-label={`Remover ${i.nome}`}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="field">
          <label className="label" htmlFor="cp-obs">Observações</label>
          <input id="cp-obs" className="input" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Nota fiscal, prazo combinado…" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end' }}>
          <span style={{ fontWeight: 700, fontSize: 16, marginRight: 'auto' }}>Total: {moeda(total)}</span>
          {erro && <span className="badge badge-danger">{erro}</span>}
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Criando…' : 'Criar pedido'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalReceber({ compra, onClose, onRecebida }) {
  const [vencimento, setVencimento] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30)
    return d.toISOString().slice(0, 10)
  })
  const [gerarFinanceiro, setGerarFinanceiro] = useState(true)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const confirmar = async () => {
    setErro('')
    setSalvando(true)
    const { error } = await supabase.rpc('receber_compra', {
      p_compra: compra.id,
      p_vencimento: gerarFinanceiro ? vencimento : null,
      p_gerar_financeiro: gerarFinanceiro,
    })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    onRecebida()
  }

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" style={{ padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, marginBottom: 6 }}>Receber compra #{compra.numero}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Isto dá entrada de {moeda(compra.total)} em mercadorias no estoque e atualiza o preço de custo dos produtos.
        </p>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', marginBottom: 12 }}>
          <input type="checkbox" className="perm-check" checked={gerarFinanceiro} onChange={(e) => setGerarFinanceiro(e.target.checked)} />
          Gerar conta a pagar de {moeda(compra.total)}
        </label>

        {gerarFinanceiro && (
          <div className="field">
            <label className="label" htmlFor="rc-venc">Vencimento</label>
            <input id="rc-venc" className="input" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </div>
        )}

        {erro && <div className="badge badge-danger" style={{ marginBottom: 12 }}>{erro}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirmar} disabled={salvando}>
            {salvando ? 'Recebendo…' : 'Confirmar recebimento'}
          </button>
        </div>
      </div>
    </div>
  )
}
