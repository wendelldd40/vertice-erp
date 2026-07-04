import { useEffect, useState, useCallback } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal, ArrowLeftRight, History, Boxes } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../hooks/usePermissions'
import { numero, dataHora } from '../lib/formatos'

const TIPOS = {
  entrada: { nome: 'Entrada', icon: ArrowDownToLine, badge: 'badge-success' },
  saida: { nome: 'Saída', icon: ArrowUpFromLine, badge: 'badge-danger' },
  ajuste: { nome: 'Ajuste', icon: SlidersHorizontal, badge: 'badge-warn' },
  transferencia: { nome: 'Transferência', icon: ArrowLeftRight, badge: 'badge-accent' },
}

export default function Estoque() {
  const { empresa } = useAuth()
  const { can } = usePermissions()
  const podeMovimentar = can('estoque', 'editar')

  const [aba, setAba] = useState('saldos') // saldos | historico
  const [saldos, setSaldos] = useState(null)
  const [historico, setHistorico] = useState(null)
  const [depositos, setDepositos] = useState([])
  const [produtos, setProdutos] = useState([])
  const [modal, setModal] = useState(null) // { tipo }

  const carregarSaldos = useCallback(async () => {
    const { data } = await supabase
      .from('estoque_saldos')
      .select('id, quantidade, produtos(id, nome, sku, estoque_minimo), depositos(id, nome)')
      .eq('empresa_id', empresa.id)
      .order('quantidade', { ascending: true })
    setSaldos(data ?? [])
  }, [empresa.id])

  const carregarHistorico = useCallback(async () => {
    const { data } = await supabase
      .from('estoque_movimentacoes')
      .select('id, tipo, quantidade, motivo, criado_em, produtos(nome), depositos!estoque_movimentacoes_deposito_id_fkey(nome), profiles(nome, email)')
      .eq('empresa_id', empresa.id)
      .order('criado_em', { ascending: false })
      .limit(80)
    setHistorico(data ?? [])
  }, [empresa.id])

  useEffect(() => {
    carregarSaldos()
    supabase.from('depositos').select('id, nome, padrao').eq('empresa_id', empresa.id).order('padrao', { ascending: false })
      .then(({ data }) => setDepositos(data ?? []))
    supabase.from('produtos').select('id, nome, sku').eq('empresa_id', empresa.id).eq('ativo', true).order('nome')
      .then(({ data }) => setProdutos(data ?? []))
  }, [empresa.id, carregarSaldos])

  useEffect(() => { if (aba === 'historico') carregarHistorico() }, [aba, carregarHistorico])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Estoque</h1>
          <p className="page-sub">Saldos por depósito e histórico completo. Todo movimento fica registrado.</p>
        </div>
        {podeMovimentar && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Object.entries(TIPOS).map(([tipo, cfg]) => (
              <button key={tipo} className={tipo === 'entrada' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setModal({ tipo })}>
                <cfg.icon size={15} /> {cfg.nome}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`btn ${aba === 'saldos' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAba('saldos')}>
          <Boxes size={15} /> Saldos
        </button>
        <button className={`btn ${aba === 'historico' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAba('historico')}>
          <History size={15} /> Histórico
        </button>
      </div>

      {aba === 'saldos' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          {saldos === null ? (
            <div style={{ padding: 16 }}>
              {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 44, marginBottom: 8 }} />)}
            </div>
          ) : saldos.length === 0 ? (
            <div className="empty">
              <strong>Nenhum saldo em estoque</strong>
              Registre uma entrada para começar a controlar o estoque.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Depósito</th>
                  <th style={{ textAlign: 'right' }}>Quantidade</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {saldos.map((s) => {
                  const min = Number(s.produtos?.estoque_minimo ?? 0)
                  const qtd = Number(s.quantidade)
                  const situacao = qtd <= 0 ? 'zerado' : min > 0 && qtd <= min ? 'baixo' : 'ok'
                  return (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 500 }}>
                        {s.produtos?.nome}
                        {s.produtos?.sku && <span style={{ color: 'var(--text-faint)', marginLeft: 8, fontSize: 12 }}>{s.produtos.sku}</span>}
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{s.depositos?.nome}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{numero(qtd)}</td>
                      <td>
                        {situacao === 'zerado' && <span className="badge badge-danger">Zerado</span>}
                        {situacao === 'baixo' && <span className="badge badge-warn">Abaixo do mínimo</span>}
                        {situacao === 'ok' && <span className="badge badge-success">Ok</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {aba === 'historico' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          {historico === null ? (
            <div style={{ padding: 16 }}>
              {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 44, marginBottom: 8 }} />)}
            </div>
          ) : historico.length === 0 ? (
            <div className="empty"><strong>Nenhuma movimentação ainda</strong>O histórico registra quem fez o quê, quando e por quê.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Produto</th>
                  <th>Tipo</th>
                  <th style={{ textAlign: 'right' }}>Qtd.</th>
                  <th>Depósito</th>
                  <th>Motivo</th>
                  <th>Por</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((m) => {
                  const cfg = TIPOS[m.tipo] ?? { nome: m.tipo, badge: 'badge-muted' }
                  return (
                    <tr key={m.id}>
                      <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{dataHora(m.criado_em)}</td>
                      <td style={{ fontWeight: 500 }}>{m.produtos?.nome}</td>
                      <td><span className={`badge ${cfg.badge}`}>{cfg.nome}</span></td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: Number(m.quantidade) < 0 ? 'var(--danger)' : 'var(--success)' }}>
                        {Number(m.quantidade) > 0 ? '+' : ''}{numero(m.quantidade)}
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{m.depositos?.nome}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{m.motivo || '—'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{m.profiles?.nome || m.profiles?.email || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {modal && (
        <ModalMovimentacao
          tipo={modal.tipo}
          produtos={produtos}
          depositos={depositos}
          onClose={() => setModal(null)}
          onSalvo={() => { setModal(null); carregarSaldos(); if (aba === 'historico') carregarHistorico() }}
        />
      )}
    </div>
  )
}

function ModalMovimentacao({ tipo, produtos, depositos, onClose, onSalvo }) {
  const cfg = TIPOS[tipo]
  const [produto, setProduto] = useState('')
  const [deposito, setDeposito] = useState(depositos.find((d) => d.padrao)?.id ?? depositos[0]?.id ?? '')
  const [destino, setDestino] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const salvar = async () => {
    setErro('')
    if (!produto) { setErro('Selecione o produto'); return }
    if (quantidade === '' || Number(quantidade) < 0) { setErro('Informe a quantidade'); return }
    setSalvando(true)
    const { error } = await supabase.rpc('movimentar_estoque', {
      p_produto: produto,
      p_deposito: deposito,
      p_tipo: tipo,
      p_quantidade: Number(quantidade),
      p_motivo: motivo || null,
      p_deposito_destino: tipo === 'transferencia' ? destino || null : null,
    })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    onSalvo()
  }

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" style={{ padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <cfg.icon size={17} /> {cfg.nome} de estoque
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 16 }}>
          {tipo === 'ajuste'
            ? 'Informe a quantidade final desejada. O sistema calcula e registra a diferença.'
            : 'Este movimento fica registrado no histórico com seu nome.'}
        </p>

        <div className="field">
          <label className="label" htmlFor="mv-prod">Produto</label>
          <select id="mv-prod" className="select" value={produto} onChange={(e) => setProduto(e.target.value)}>
            <option value="">Selecione…</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}{p.sku ? ` (${p.sku})` : ''}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label className="label" htmlFor="mv-dep">{tipo === 'transferencia' ? 'De' : 'Depósito'}</label>
            <select id="mv-dep" className="select" value={deposito} onChange={(e) => setDeposito(e.target.value)}>
              {depositos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          </div>
          {tipo === 'transferencia' && (
            <div className="field" style={{ flex: 1 }}>
              <label className="label" htmlFor="mv-dest">Para</label>
              <select id="mv-dest" className="select" value={destino} onChange={(e) => setDestino(e.target.value)}>
                <option value="">Selecione…</option>
                {depositos.filter((d) => d.id !== deposito).map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </div>
          )}
          <div className="field" style={{ flex: 1 }}>
            <label className="label" htmlFor="mv-qtd">{tipo === 'ajuste' ? 'Quantidade final' : 'Quantidade'}</label>
            <input id="mv-qtd" className="input" type="number" min="0" step="any" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="mv-motivo">Motivo <span style={{ color: 'var(--text-faint)' }}>(recomendado)</span></label>
          <input
            id="mv-motivo" className="input" value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && salvar()}
            placeholder={tipo === 'entrada' ? 'Compra do fornecedor X' : tipo === 'ajuste' ? 'Contagem de inventário' : 'Descreva o motivo'}
          />
        </div>

        {erro && <div className="badge badge-danger" style={{ marginBottom: 12 }}>{erro}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Registrando…' : `Registrar ${cfg.nome.toLowerCase()}`}
          </button>
        </div>
      </div>
    </div>
  )
}
