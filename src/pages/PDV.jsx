import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Banknote, QrCode, CreditCard, Trash2, CheckCircle2, MessageCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../hooks/usePermissions'
import { moeda } from '../lib/formatos'

const FORMAS = [
  { valor: 'dinheiro', nome: 'Dinheiro', tecla: '1', icon: Banknote },
  { valor: 'pix', nome: 'PIX', tecla: '2', icon: QrCode },
  { valor: 'debito', nome: 'Débito', tecla: '3', icon: CreditCard },
  { valor: 'credito', nome: 'Crédito', tecla: '4', icon: CreditCard },
]

const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export default function PDV() {
  const { empresa } = useAuth()
  const { can } = usePermissions()
  const podeVender = can('vendas', 'criar')

  const [produtos, setProdutos] = useState([])
  const [clientes, setClientes] = useState([])
  const [busca, setBusca] = useState('')
  const [selecionado, setSelecionado] = useState(0)
  const [carrinho, setCarrinho] = useState([])
  const [pagamento, setPagamento] = useState(false)
  const [sucesso, setSucesso] = useState(null) // { numero, total, troco }
  const buscaRef = useRef(null)

  // Catálogo em memória: bipagem e busca respondem em 0ms
  useEffect(() => {
    supabase.from('produtos')
      .select('id, nome, sku, codigo_barras, imagem_url, preco_venda, preco_promocional')
      .eq('empresa_id', empresa.id).eq('ativo', true)
      .then(({ data }) => setProdutos(data ?? []))
    supabase.from('clientes')
      .select('id, nome, telefone')
      .eq('empresa_id', empresa.id)
      .then(({ data }) => setClientes(data ?? []))
  }, [empresa.id])

  const resultados = useMemo(() => {
    if (!busca.trim()) return []
    const q = norm(busca)
    return produtos.filter((p) =>
      norm(p.nome).includes(q) || (p.sku && norm(p.sku).includes(q)) || (p.codigo_barras && p.codigo_barras.includes(busca.trim()))
    ).slice(0, 8)
  }, [busca, produtos])

  useEffect(() => setSelecionado(0), [busca])

  const precoDe = (p) => Number(p.preco_promocional ?? 0) > 0 ? Number(p.preco_promocional) : Number(p.preco_venda)

  const adicionar = useCallback((p) => {
    if (!p) return
    setCarrinho((c) => {
      const idx = c.findIndex((i) => i.produto_id === p.id)
      if (idx >= 0) {
        const novo = [...c]
        novo[idx] = { ...novo[idx], quantidade: novo[idx].quantidade + 1 }
        return novo
      }
      return [...c, { produto_id: p.id, nome: p.nome, preco_unitario: precoDe(p), quantidade: 1 }]
    })
    setBusca('')
    buscaRef.current?.focus()
  }, [])

  const alterarQtd = (produto_id, qtd) => {
    const n = Number(qtd)
    setCarrinho((c) => c.map((i) => (i.produto_id === produto_id ? { ...i, quantidade: n } : i)))
  }

  const remover = (produto_id) => setCarrinho((c) => c.filter((i) => i.produto_id !== produto_id))

  const subtotal = carrinho.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)

  const onBuscaKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      // Código de barras exato tem prioridade (leitor bipa e envia Enter)
      const exato = produtos.find((p) => p.codigo_barras && p.codigo_barras === busca.trim())
      adicionar(exato ?? resultados[selecionado])
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelecionado((s) => Math.min(s + 1, resultados.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelecionado((s) => Math.max(s - 1, 0)) }
  }

  // F2 abre pagamento de qualquer lugar da tela
  useEffect(() => {
    const atalho = (e) => {
      if (e.key === 'F2' && carrinho.length > 0 && !pagamento && !sucesso) {
        e.preventDefault()
        setPagamento(true)
      }
    }
    window.addEventListener('keydown', atalho)
    return () => window.removeEventListener('keydown', atalho)
  }, [carrinho.length, pagamento, sucesso])

  const novaVenda = () => {
    setSucesso(null)
    setCarrinho([])
    setBusca('')
    setTimeout(() => buscaRef.current?.focus(), 10)
  }

  if (!podeVender) {
    return (
      <div className="page">
        <div className="card empty"><strong>Sem permissão</strong>Sua função não permite registrar vendas.</div>
      </div>
    )
  }

  if (sucesso) {
    return (
      <div className="page">
        <div className="card empty" style={{ paddingTop: 56, paddingBottom: 56 }}>
          <CheckCircle2 size={36} style={{ color: 'var(--success)', marginBottom: 12 }} />
          <strong style={{ fontSize: 18 }}>Venda #{sucesso.numero} concluída</strong>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', margin: '8px 0' }}>
            {moeda(sucesso.total)}
          </div>
          {sucesso.troco > 0 && (
            <span className="badge badge-warn" style={{ fontSize: 14, marginBottom: 12 }}>
              Troco: {moeda(sucesso.troco)}
            </span>
          )}
          <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" autoFocus onClick={novaVenda} onKeyDown={(e) => e.key === 'Enter' && novaVenda()}>
              Nova venda (Enter)
            </button>
            <a
              className="btn btn-ghost"
              href={`https://wa.me/?text=${encodeURIComponent(
                `*Comprovante — Venda #${sucesso.numero}*\n` +
                (sucesso.cliente ? `Cliente: ${sucesso.cliente}\n` : '') +
                sucesso.itens.join('\n') +
                `\nTotal: ${moeda(sucesso.total)}\nPagamento: ${FORMAS.find((x) => x.valor === sucesso.forma)?.nome ?? sucesso.forma}\nObrigado pela preferência!`
              )}`}
              target="_blank" rel="noreferrer"
            >
              <MessageCircle size={15} /> Comprovante no WhatsApp
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Venda rápida</h1>
          <p className="page-sub">Bipe o código de barras ou digite o nome. F2 finaliza.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 18, alignItems: 'start' }} className="pdv-grid">
        <div>
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <input
              ref={buscaRef}
              className="input"
              style={{ padding: '13px 14px', fontSize: 15 }}
              autoFocus
              placeholder="Código de barras, nome ou SKU…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={onBuscaKeyDown}
            />
            {resultados.length > 0 && (
              <div className="card" style={{ position: 'absolute', top: '110%', left: 0, right: 0, zIndex: 15, padding: 6 }}>
                {resultados.map((p, i) => (
                  <div
                    key={p.id}
                    className={`palette-item ${i === selecionado ? 'selected' : ''}`}
                    onMouseEnter={() => setSelecionado(i)}
                    onClick={() => adicionar(p)}
                  >
                    <span style={{
                      width: 28, height: 28, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
                      background: 'var(--surface-2)', display: 'grid', placeItems: 'center',
                      fontSize: 11, color: 'var(--text-faint)',
                    }}>
                      {p.imagem_url
                        ? <img src={p.imagem_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : (p.nome || '?')[0].toUpperCase()}
                    </span>
                    {p.nome}
                    <span className="group">{moeda(precoDe(p))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ overflow: 'hidden' }}>
            {carrinho.length === 0 ? (
              <div className="empty">
                <strong>Carrinho vazio</strong>
                O primeiro item entra assim que você bipar ou selecionar um produto.
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th style={{ width: 90 }}>Qtd.</th>
                    <th style={{ textAlign: 'right' }}>Unit.</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {carrinho.map((i) => (
                    <tr key={i.produto_id}>
                      <td style={{ fontWeight: 500 }}>{i.nome}</td>
                      <td>
                        <input
                          className="input" type="number" min="1" step="any"
                          style={{ padding: '5px 8px', width: 74 }}
                          value={i.quantidade}
                          onChange={(e) => alterarQtd(i.produto_id, e.target.value)}
                          aria-label={`Quantidade de ${i.nome}`}
                        />
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{moeda(i.preco_unitario)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{moeda(i.quantidade * i.preco_unitario)}</td>
                      <td>
                        <button className="icon-btn" onClick={() => remover(i.produto_id)} aria-label={`Remover ${i.nome}`}>
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: 20, position: 'sticky', top: 76 }}>
          <div className="kpi-label">
            Total
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, fontFamily: 'var(--font-display)', margin: '6px 0 4px' }}>
            {moeda(subtotal)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            {carrinho.reduce((s, i) => s + Number(i.quantidade), 0)} itens
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '12px 16px', fontSize: 15 }}
            disabled={carrinho.length === 0}
            onClick={() => setPagamento(true)}
          >
            Finalizar venda (F2)
          </button>
          {carrinho.length > 0 && (
            <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={() => setCarrinho([])}>
              Limpar carrinho
            </button>
          )}
        </div>
      </div>

      {pagamento && (
        <ModalPagamento
          subtotal={subtotal}
          carrinho={carrinho}
          clientes={clientes}
          onClose={() => { setPagamento(false); buscaRef.current?.focus() }}
          onConcluida={(dados) => { setPagamento(false); setSucesso(dados) }}
        />
      )}

      <style>{`@media (max-width: 900px) { .pdv-grid { grid-template-columns: 1fr !important; } .pdv-grid .card { position: static !important; } }`}</style>
    </div>
  )
}

function ModalPagamento({ subtotal, carrinho, clientes, onClose, onConcluida }) {
  const [forma, setForma] = useState('dinheiro')
  const [desconto, setDesconto] = useState('')
  const [recebido, setRecebido] = useState('')
  const [cliente, setCliente] = useState('')
  const [clienteId, setClienteId] = useState(null)
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false)
  const [erro, setErro] = useState('')

  const sugestoes = useMemo(() => {
    if (!cliente.trim() || clienteId) return []
    const q = norm(cliente)
    return clientes.filter((c) => norm(c.nome).includes(q) || (c.telefone || '').includes(cliente.trim())).slice(0, 6)
  }, [cliente, clienteId, clientes])
  const [salvando, setSalvando] = useState(false)

  const total = Math.max(subtotal - (Number(desconto) || 0), 0)
  const troco = forma === 'dinheiro' && recebido !== '' ? Number(recebido) - total : 0

  // Atalhos 1-4 escolhem a forma; Enter confirma; Esc fecha
  useEffect(() => {
    const atalho = (e) => {
      const f = FORMAS.find((x) => x.tecla === e.key)
      if (f && e.target.tagName !== 'INPUT') setForma(f.valor)
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', atalho)
    return () => window.removeEventListener('keydown', atalho)
  }, [onClose])

  const confirmar = async () => {
    setErro('')
    if (forma === 'dinheiro' && (recebido === '' || Number(recebido) < total)) {
      setErro('Informe o valor recebido (igual ou maior que o total)')
      return
    }
    setSalvando(true)
    const { data, error } = await supabase.rpc('registrar_venda', {
      p_itens: carrinho.map((i) => ({
        produto_id: i.produto_id,
        quantidade: Number(i.quantidade),
        preco_unitario: Number(i.preco_unitario),
      })),
      p_forma_pagamento: forma,
      p_desconto: Number(desconto) || 0,
      p_valor_recebido: forma === 'dinheiro' ? Number(recebido) : null,
      p_cliente_nome: clienteId ? null : (cliente || null),
      p_cliente_id: clienteId,
    })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    const row = Array.isArray(data) ? data[0] : data
    onConcluida({
      numero: row.numero, total, troco: troco > 0 ? troco : 0,
      forma, cliente: cliente || null,
      itens: carrinho.map((i) => `${i.quantidade}x ${i.nome}`),
    })
  }

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" style={{ padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>Pagamento</h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
          {FORMAS.map((f) => (
            <button
              key={f.valor}
              className={`btn ${forma === f.valor ? 'btn-primary' : 'btn-ghost'}`}
              style={{ justifyContent: 'center', flexDirection: 'column', gap: 4, padding: '12px 8px' }}
              onClick={() => setForma(f.valor)}
            >
              <f.icon size={17} />
              <span style={{ fontSize: 12 }}>{f.nome}</span>
              <kbd style={{ fontSize: 10, color: 'var(--text-faint)' }}>{f.tecla}</kbd>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label className="label" htmlFor="pg-desc">Desconto (R$)</label>
            <input id="pg-desc" className="input" type="number" min="0" step="0.01" value={desconto} onChange={(e) => setDesconto(e.target.value)} placeholder="0,00" />
          </div>
          {forma === 'dinheiro' && (
            <div className="field" style={{ flex: 1 }}>
              <label className="label" htmlFor="pg-rec">Valor recebido</label>
              <input
                id="pg-rec" className="input" type="number" min="0" step="0.01" autoFocus
                value={recebido} onChange={(e) => setRecebido(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmar()}
                placeholder={total.toFixed(2)}
              />
            </div>
          )}
        </div>

        <div className="field" style={{ position: 'relative' }}>
          <label className="label" htmlFor="pg-cli">
            Cliente <span style={{ color: 'var(--text-faint)' }}>(opcional)</span>
            {clienteId && <span className="badge badge-accent" style={{ marginLeft: 8 }}>vinculado</span>}
          </label>
          <input
            id="pg-cli" className="input" value={cliente}
            onChange={(e) => { setCliente(e.target.value); setClienteId(null); setMostrarSugestoes(true) }}
            onFocus={() => setMostrarSugestoes(true)}
            placeholder="Busque um cliente cadastrado ou digite um nome"
            autoComplete="off"
          />
          {mostrarSugestoes && sugestoes.length > 0 && (
            <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, padding: 6, marginTop: 4 }}>
              {sugestoes.map((c) => (
                <div
                  key={c.id}
                  className="palette-item"
                  onClick={() => { setCliente(c.nome); setClienteId(c.id); setMostrarSugestoes(false) }}
                >
                  {c.nome}
                  {c.telefone && <span className="group">{c.telefone}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 14, marginBottom: 14, boxShadow: 'none', background: 'var(--surface-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-muted)' }}>
            <span>Subtotal</span><span>{moeda(subtotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, marginTop: 6 }}>
            <span>Total</span><span>{moeda(total)}</span>
          </div>
          {forma === 'dinheiro' && troco > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginTop: 6, color: 'var(--warn)', fontWeight: 600 }}>
              <span>Troco</span><span>{moeda(troco)}</span>
            </div>
          )}
        </div>

        {erro && <div className="badge badge-danger" style={{ marginBottom: 12 }}>{erro}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Voltar (Esc)</button>
          <button className="btn btn-primary" onClick={confirmar} disabled={salvando}>
            {salvando ? 'Registrando…' : 'Confirmar venda'}
          </button>
        </div>
      </div>
    </div>
  )
}
