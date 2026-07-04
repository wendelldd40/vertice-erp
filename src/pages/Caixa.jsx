import { useEffect, useState, useCallback } from 'react'
import { Banknote, QrCode, CreditCard } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { moeda, dataHora } from '../lib/formatos'

const FORMA_CFG = {
  dinheiro: { nome: 'Dinheiro', icon: Banknote },
  pix: { nome: 'PIX', icon: QrCode },
  debito: { nome: 'Débito', icon: CreditCard },
  credito: { nome: 'Crédito', icon: CreditCard },
}

export default function Caixa() {
  const { empresa } = useAuth()
  const [vendas, setVendas] = useState(null)
  const [lancHoje, setLancHoje] = useState(null)

  const carregar = useCallback(async () => {
    const hoje = new Date().toISOString().slice(0, 10)
    const [{ data: v }, { data: l }] = await Promise.all([
      supabase.from('vendas')
        .select('id, numero, total, forma_pagamento, status, criado_em')
        .eq('empresa_id', empresa.id)
        .gte('criado_em', hoje)
        .order('criado_em', { ascending: false }),
      supabase.from('lancamentos')
        .select('tipo, valor, status, pago_em')
        .eq('empresa_id', empresa.id)
        .eq('status', 'pago')
        .gte('pago_em', hoje),
    ])
    setVendas(v ?? [])
    setLancHoje(l ?? [])
  }, [empresa.id])

  useEffect(() => { carregar() }, [carregar])

  const concluidas = (vendas ?? []).filter((v) => v.status === 'concluida')
  const totalVendas = concluidas.reduce((s, v) => s + Number(v.total), 0)
  const ticket = concluidas.length ? totalVendas / concluidas.length : 0

  const porForma = (forma) => concluidas
    .filter((v) => v.forma_pagamento === forma)
    .reduce((s, v) => s + Number(v.total), 0)

  const recebidoHoje = (lancHoje ?? []).filter((l) => l.tipo === 'receita').reduce((s, l) => s + Number(l.valor), 0)
  const pagoHoje = (lancHoje ?? []).filter((l) => l.tipo === 'despesa').reduce((s, l) => s + Number(l.valor), 0)

  const carregando = vendas === null

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Caixa do dia</h1>
          <p className="page-sub">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
        <Kpi titulo="Vendas hoje" valor={concluidas.length} formatar={false} carregando={carregando} />
        <Kpi titulo="Faturamento" valor={totalVendas} carregando={carregando} />
        <Kpi titulo="Ticket médio" valor={ticket} carregando={carregando} />
        <Kpi
          titulo="Saldo do dia"
          valor={recebidoHoje - pagoHoje}
          cor={recebidoHoje - pagoHoje >= 0 ? 'var(--success)' : 'var(--danger)'}
          carregando={carregando}
        />
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ fontWeight: 600, marginBottom: 14 }}>Recebimentos de hoje por forma</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          {Object.entries(FORMA_CFG).map(([forma, cfg]) => (
            <div key={forma} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9, display: 'grid', placeItems: 'center',
                background: 'var(--accent-soft)', color: 'var(--accent-text)',
              }}>
                <cfg.icon size={17} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {cfg.nome}
                  {forma === 'credito' && <span style={{ color: 'var(--text-faint)' }}> (cai em 30d)</span>}
                </div>
                <div style={{ fontWeight: 700 }}>{carregando ? '—' : moeda(porForma(forma))}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
          Vendas de hoje
        </div>
        {carregando ? (
          <div style={{ padding: 16 }}>
            {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 42, marginBottom: 8 }} />)}
          </div>
        ) : vendas.length === 0 ? (
          <div className="empty"><strong>Nenhuma venda hoje ainda</strong>Elas aparecem aqui em tempo real conforme o PDV registra.</div>
        ) : (
          <table className="table">
            <tbody>
              {vendas.map((v) => (
                <tr key={v.id} style={{ opacity: v.status === 'cancelada' ? 0.5 : 1 }}>
                  <td style={{ fontWeight: 600, width: 70 }}>#{v.numero}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{dataHora(v.criado_em)}</td>
                  <td><span className="badge badge-muted">{FORMA_CFG[v.forma_pagamento]?.nome ?? v.forma_pagamento}</span></td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{moeda(v.total)}</td>
                  <td style={{ width: 90 }}>
                    <span className={`badge ${v.status === 'concluida' ? 'badge-success' : 'badge-danger'}`}>
                      {v.status === 'concluida' ? 'Ok' : 'Cancelada'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Kpi({ titulo, valor, cor = 'var(--text)', formatar = true, carregando }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="kpi-label">
        {titulo}
      </div>
      {carregando ? (
        <div className="skeleton" style={{ height: 26, marginTop: 8, width: 90 }} />
      ) : (
        <div style={{ fontSize: 21, fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: 6, color: cor }}>
          {formatar ? moeda(valor) : valor}
        </div>
      )}
    </div>
  )
}
