import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../hooks/usePermissions'
import { moeda, numero as fmtNum, dataHora } from '../lib/formatos'

const FORMA_NOME = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Débito', credito: 'Crédito' }

export default function Vendas() {
  const { empresa } = useAuth()
  const { can } = usePermissions()
  const navigate = useNavigate()

  const [lista, setLista] = useState(null)
  const [aberta, setAberta] = useState(null) // venda expandida
  const [itens, setItens] = useState({})     // cache: venda_id -> itens

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('vendas')
      .select('id, numero, cliente_nome, total, desconto, forma_pagamento, status, criado_em, profiles(nome, email)')
      .eq('empresa_id', empresa.id)
      .order('criado_em', { ascending: false })
      .limit(60)
    setLista(data ?? [])
  }, [empresa.id])

  useEffect(() => { carregar() }, [carregar])

  const abrir = async (venda) => {
    if (aberta === venda.id) { setAberta(null); return }
    setAberta(venda.id)
    if (!itens[venda.id]) {
      const { data } = await supabase
        .from('venda_itens')
        .select('id, produto_nome, quantidade, preco_unitario, total')
        .eq('venda_id', venda.id)
      setItens((c) => ({ ...c, [venda.id]: data ?? [] }))
    }
  }

  const cancelar = async (venda) => {
    if (!window.confirm(`Cancelar a venda #${venda.numero}? O estoque dos itens será devolvido automaticamente.`)) return
    const { error } = await supabase.rpc('cancelar_venda', { p_venda: venda.id })
    if (error) { alert(error.message); return }
    carregar()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Vendas</h1>
          <p className="page-sub">Histórico completo. Clique numa venda para ver os itens.</p>
        </div>
        {can('vendas', 'criar') && (
          <button className="btn btn-primary" onClick={() => navigate('/pdv')}>
            <Plus size={15} /> Nova venda
          </button>
        )}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {lista === null ? (
          <div style={{ padding: 16 }}>
            {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 44, marginBottom: 8 }} />)}
          </div>
        ) : lista.length === 0 ? (
          <div className="empty">
            <strong>Nenhuma venda registrada</strong>
            Abra a Venda rápida e registre a primeira em segundos.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Quando</th>
                <th>Cliente</th>
                <th>Pagamento</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((v) => (
                <FragmentoVenda
                  key={v.id}
                  venda={v}
                  aberta={aberta === v.id}
                  itens={itens[v.id]}
                  onAbrir={() => abrir(v)}
                  onCancelar={can('vendas', 'excluir') && v.status === 'concluida' ? () => cancelar(v) : null}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function FragmentoVenda({ venda, aberta, itens, onAbrir, onCancelar }) {
  return (
    <>
      <tr style={{ cursor: 'pointer', opacity: venda.status === 'cancelada' ? 0.55 : 1 }} onClick={onAbrir}>
        <td style={{ fontWeight: 600 }}>#{venda.numero}</td>
        <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{dataHora(venda.criado_em)}</td>
        <td>{venda.cliente_nome || <span style={{ color: 'var(--text-faint)' }}>—</span>}</td>
        <td><span className="badge badge-muted">{FORMA_NOME[venda.forma_pagamento] ?? venda.forma_pagamento}</span></td>
        <td style={{ textAlign: 'right', fontWeight: 600 }}>{moeda(venda.total)}</td>
        <td>
          <span className={`badge ${venda.status === 'concluida' ? 'badge-success' : 'badge-danger'}`}>
            {venda.status === 'concluida' ? 'Concluída' : 'Cancelada'}
          </span>
        </td>
        <td style={{ width: 1 }}>
          {onCancelar && (
            <button className="icon-btn" onClick={(e) => { e.stopPropagation(); onCancelar() }} aria-label={`Cancelar venda ${venda.numero}`}>
              <XCircle size={16} />
            </button>
          )}
        </td>
      </tr>
      {aberta && (
        <tr>
          <td colSpan={7} style={{ background: 'var(--surface-2)', padding: '10px 16px' }}>
            {!itens ? (
              <div className="skeleton" style={{ height: 32 }} />
            ) : (
              <div style={{ fontSize: 13 }}>
                {itens.map((i) => (
                  <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span>{fmtNum(i.quantidade)}× {i.produto_nome} <span style={{ color: 'var(--text-faint)' }}>({moeda(i.preco_unitario)})</span></span>
                    <span style={{ fontWeight: 600 }}>{moeda(i.total)}</span>
                  </div>
                ))}
                {Number(venda.desconto) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: 'var(--warn)' }}>
                    <span>Desconto</span><span>−{moeda(venda.desconto)}</span>
                  </div>
                )}
                <div style={{ color: 'var(--text-faint)', marginTop: 6 }}>
                  Vendedor: {venda.profiles?.nome || venda.profiles?.email || '—'}
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
