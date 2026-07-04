import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Trash2, Phone, Mail, MapPin, Cake } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { usePermissions } from '../hooks/usePermissions'
import { moeda, dataHora } from '../lib/formatos'
import { ETAPAS, ModalCliente } from './Clientes'

const FORMA_NOME = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Débito', credito: 'Crédito' }

export default function ClienteDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { can } = usePermissions()

  const [cliente, setCliente] = useState(null)
  const [resumo, setResumo] = useState(null)
  const [compras, setCompras] = useState(null)
  const [editando, setEditando] = useState(false)

  const carregar = useCallback(async () => {
    const [{ data: c }, { data: r }, { data: v }] = await Promise.all([
      supabase.from('clientes').select('*').eq('id', id).single(),
      supabase.rpc('cliente_resumo', { p_cliente: id }),
      supabase.from('vendas')
        .select('id, numero, total, forma_pagamento, status, criado_em')
        .eq('cliente_id', id)
        .order('criado_em', { ascending: false })
        .limit(30),
    ])
    setCliente(c ?? null)
    setResumo(r ?? null)
    setCompras(v ?? [])
  }, [id])

  useEffect(() => { carregar() }, [carregar])

  const excluir = async () => {
    if (!window.confirm(`Excluir ${cliente.nome}? As vendas dele são mantidas no histórico.`)) return
    await supabase.from('clientes').delete().eq('id', id)
    navigate('/clientes')
  }

  if (!cliente) {
    return (
      <div className="page">
        <div className="skeleton" style={{ height: 44, maxWidth: 420, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 200, maxWidth: 720 }} />
      </div>
    )
  }

  const etapa = ETAPAS.find((e) => e.id === cliente.etapa)

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="icon-btn" onClick={() => navigate('/clientes')} aria-label="Voltar">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">
              {cliente.nome}
              <span className="badge badge-muted" style={{ marginLeft: 10, verticalAlign: 'middle', color: etapa?.cor }}>
                ● {etapa?.nome}
              </span>
            </h1>
            <p className="page-sub">{cliente.tipo === 'pj' ? 'Pessoa jurídica' : 'Pessoa física'}{cliente.cpf_cnpj ? ` · ${cliente.cpf_cnpj}` : ''}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {can('clientes', 'excluir') && (
            <button className="btn btn-danger" onClick={excluir}><Trash2 size={14} /> Excluir</button>
          )}
          {can('clientes', 'editar') && (
            <button className="btn btn-primary" onClick={() => setEditando(true)}><Pencil size={14} /> Editar</button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
        <Kpi titulo="Total gasto" valor={resumo ? moeda(resumo.total_gasto) : null} />
        <Kpi titulo="Compras" valor={resumo ? String(resumo.qtd_compras) : null} />
        <Kpi titulo="Ticket médio" valor={resumo ? moeda(resumo.ticket_medio) : null} />
        <Kpi titulo="Última compra" valor={resumo ? (resumo.ultima_compra ? dataHora(resumo.ultima_compra) : 'Nunca') : null} pequeno />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) minmax(0, 2fr)', gap: 16 }} className="cli-grid">
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Contato</div>
          <Info icon={Phone} valor={cliente.telefone} />
          <Info icon={Mail} valor={cliente.email} />
          <Info icon={MapPin} valor={[cliente.endereco, cliente.cidade, cliente.uf].filter(Boolean).join(', ')} />
          <Info icon={Cake} valor={cliente.aniversario ? cliente.aniversario.split('-').reverse().join('/') : null} />
          {cliente.observacoes && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)' }}>
              {cliente.observacoes}
            </div>
          )}
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
            Histórico de compras
          </div>
          {compras === null ? (
            <div style={{ padding: 16 }}>
              {[1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 40, marginBottom: 8 }} />)}
            </div>
          ) : compras.length === 0 ? (
            <div className="empty">
              <strong>Nenhuma compra registrada</strong>
              Vincule este cliente na próxima venda do PDV e o histórico nasce aqui.
            </div>
          ) : (
            <table className="table">
              <tbody>
                {compras.map((v) => (
                  <tr key={v.id} style={{ opacity: v.status === 'cancelada' ? 0.5 : 1 }}>
                    <td style={{ fontWeight: 600, width: 70 }}>#{v.numero}</td>
                    <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{dataHora(v.criado_em)}</td>
                    <td><span className="badge badge-muted">{FORMA_NOME[v.forma_pagamento] ?? v.forma_pagamento}</span></td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{moeda(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editando && (
        <ModalCliente
          cliente={cliente}
          onClose={() => setEditando(false)}
          onSalvo={() => { setEditando(false); carregar() }}
        />
      )}

      <style>{`@media (max-width: 800px) { .cli-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}

function Kpi({ titulo, valor, pequeno }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="kpi-label">
        {titulo}
      </div>
      {valor === null ? (
        <div className="skeleton" style={{ height: 24, marginTop: 8, width: 90 }} />
      ) : (
        <div style={{ fontSize: pequeno ? 14 : 20, fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: 6 }}>
          {valor}
        </div>
      )}
    </div>
  )
}

function Info({ icon: Icon, valor }) {
  if (!valor) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, padding: '5px 0', color: 'var(--text-muted)' }}>
      <Icon size={14} style={{ flexShrink: 0 }} /> {valor}
    </div>
  )
}
