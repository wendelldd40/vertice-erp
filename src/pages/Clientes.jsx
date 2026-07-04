import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, LayoutGrid, List, Phone, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../hooks/usePermissions'

export const ETAPAS = [
  { id: 'lead', nome: 'Lead', cor: 'var(--text-faint)' },
  { id: 'contato', nome: 'Em contato', cor: 'var(--warn)' },
  { id: 'negociacao', nome: 'Negociação', cor: 'var(--accent-text)' },
  { id: 'cliente', nome: 'Cliente ativo', cor: 'var(--success)' },
  { id: 'inativo', nome: 'Inativo', cor: 'var(--danger)' },
]

const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export default function Clientes() {
  const { empresa } = useAuth()
  const { can } = usePermissions()
  const navigate = useNavigate()

  const [lista, setLista] = useState(null)
  const [busca, setBusca] = useState('')
  const [visao, setVisao] = useState(() => localStorage.getItem('vertice-clientes-visao') || 'kanban')
  const [modal, setModal] = useState(false)
  const [arrastando, setArrastando] = useState(null)

  useEffect(() => { localStorage.setItem('vertice-clientes-visao', visao) }, [visao])

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('clientes')
      .select('id, nome, tipo, telefone, email, etapa, cidade')
      .eq('empresa_id', empresa.id)
      .order('atualizado_em', { ascending: false })
    setLista(data ?? [])
  }, [empresa.id])

  useEffect(() => { carregar() }, [carregar])

  const filtrados = useMemo(() => {
    if (!busca.trim()) return lista ?? []
    const q = norm(busca)
    return (lista ?? []).filter((c) =>
      norm(c.nome).includes(q) || norm(c.email).includes(q) || (c.telefone || '').includes(busca.trim())
    )
  }, [lista, busca])

  const moverEtapa = async (clienteId, etapa) => {
    // Otimista: card muda de coluna na hora
    setLista((l) => l.map((c) => (c.id === clienteId ? { ...c, etapa } : c)))
    const { error } = await supabase.from('clientes').update({ etapa }).eq('id', clienteId)
    if (error) carregar() // reverte recarregando
  }

  return (
    <div className="page" style={{ maxWidth: visao === 'kanban' ? 1400 : 1200 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-sub">
            {visao === 'kanban'
              ? 'Arraste os cards entre as colunas para atualizar o estágio do relacionamento.'
              : `${filtrados.length} ${filtrados.length === 1 ? 'cliente' : 'clientes'}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn ${visao === 'kanban' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setVisao('kanban')} aria-label="Visão Kanban">
            <LayoutGrid size={15} /> Kanban
          </button>
          <button className={`btn ${visao === 'lista' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setVisao('lista')} aria-label="Visão lista">
            <List size={15} /> Lista
          </button>
          {can('clientes', 'criar') && (
            <button className="btn btn-primary" onClick={() => setModal(true)}>
              <Plus size={15} /> Novo cliente
            </button>
          )}
        </div>
      </div>

      <div style={{ position: 'relative', maxWidth: 380, marginBottom: 18 }}>
        <Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--text-faint)' }} />
        <input
          className="input" style={{ paddingLeft: 34 }}
          placeholder="Nome, e-mail ou telefone…"
          value={busca} onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {lista === null ? (
        <div style={{ display: 'flex', gap: 12 }}>
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 200, flex: 1 }} />)}
        </div>
      ) : visao === 'kanban' ? (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ETAPAS.length}, minmax(210px, 1fr))`, gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
          {ETAPAS.map((etapa) => {
            const cards = filtrados.filter((c) => c.etapa === etapa.id)
            return (
              <div
                key={etapa.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const id = e.dataTransfer.getData('text/plain')
                  if (id) moverEtapa(id, etapa.id)
                  setArrastando(null)
                }}
                style={{
                  background: 'var(--surface-2)', borderRadius: 'var(--radius)',
                  padding: 10, minHeight: 220,
                  outline: arrastando ? '2px dashed var(--border)' : 'none',
                  outlineOffset: -2,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 6px 10px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: etapa.cor }} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{etapa.nome}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-faint)' }}>{cards.length}</span>
                </div>

                {cards.map((c) => (
                  <div
                    key={c.id}
                    draggable={can('clientes', 'editar')}
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', c.id); setArrastando(c.id) }}
                    onDragEnd={() => setArrastando(null)}
                    onClick={() => navigate(`/clientes/${c.id}`)}
                    className="card"
                    style={{
                      padding: '10px 12px', marginBottom: 8, cursor: 'pointer',
                      opacity: arrastando === c.id ? 0.4 : 1,
                      boxShadow: 'var(--shadow)',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{c.nome}</div>
                    {c.telefone && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Phone size={11} /> {c.telefone}
                      </div>
                    )}
                    {!c.telefone && c.email && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Mail size={11} /> {c.email}
                      </div>
                    )}
                  </div>
                ))}

                {cards.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-faint)', textAlign: 'center', padding: '18px 6px' }}>
                    Solte um card aqui
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {filtrados.length === 0 ? (
            <div className="empty">
              <strong>{busca ? 'Nada encontrado' : 'Nenhum cliente ainda'}</strong>
              {busca ? 'Tente outro termo.' : 'Cadastre o primeiro no botão acima.'}
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Contato</th>
                  <th>Cidade</th>
                  <th>Estágio</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => {
                  const etapa = ETAPAS.find((e) => e.id === c.etapa)
                  return (
                    <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/clientes/${c.id}`)}>
                      <td style={{ fontWeight: 500 }}>
                        {c.nome}
                        <span className="badge badge-muted" style={{ marginLeft: 8, fontSize: 10 }}>{c.tipo === 'pj' ? 'PJ' : 'PF'}</span>
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{c.telefone || c.email || '—'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{c.cidade || '—'}</td>
                      <td>
                        <span className="badge badge-muted" style={{ color: etapa?.cor }}>
                          ● {etapa?.nome}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {modal && (
        <ModalCliente
          onClose={() => setModal(false)}
          onSalvo={() => { setModal(false); carregar() }}
        />
      )}
    </div>
  )
}

export function ModalCliente({ cliente, onClose, onSalvo }) {
  const { empresa } = useAuth()
  const editando = !!cliente
  const [form, setForm] = useState({
    nome: cliente?.nome ?? '', tipo: cliente?.tipo ?? 'pf',
    cpf_cnpj: cliente?.cpf_cnpj ?? '', telefone: cliente?.telefone ?? '',
    email: cliente?.email ?? '', aniversario: cliente?.aniversario ?? '',
    cidade: cliente?.cidade ?? '', uf: cliente?.uf ?? '',
    endereco: cliente?.endereco ?? '', observacoes: cliente?.observacoes ?? '',
    etapa: cliente?.etapa ?? 'lead',
  })
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }))

  const salvar = async () => {
    if (!form.nome.trim()) { setErro('Informe o nome'); return }
    setErro('')
    setSalvando(true)
    const payload = {
      empresa_id: empresa.id,
      nome: form.nome.trim(),
      tipo: form.tipo,
      cpf_cnpj: form.cpf_cnpj || null,
      telefone: form.telefone || null,
      email: form.email || null,
      aniversario: form.aniversario || null,
      cidade: form.cidade || null,
      uf: form.uf || null,
      endereco: form.endereco || null,
      observacoes: form.observacoes || null,
      etapa: form.etapa,
    }
    const q = editando
      ? supabase.from('clientes').update(payload).eq('id', cliente.id)
      : supabase.from('clientes').insert(payload)
    const { error } = await q
    setSalvando(false)
    if (error) { setErro(error.message); return }
    onSalvo()
  }

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" style={{ padding: 22, width: 'min(600px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>{editando ? 'Editar cliente' : 'Novo cliente'}</h2>

        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field" style={{ flex: 2 }}>
            <label className="label" htmlFor="cl-nome">Nome *</label>
            <input id="cl-nome" className="input" autoFocus value={form.nome} onChange={set('nome')} placeholder="Maria Silva" />
          </div>
          <div className="field" style={{ flex: '0 0 100px' }}>
            <label className="label" htmlFor="cl-tipo">Tipo</label>
            <select id="cl-tipo" className="select" value={form.tipo} onChange={set('tipo')}>
              <option value="pf">PF</option>
              <option value="pj">PJ</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <div className="field">
            <label className="label" htmlFor="cl-doc">{form.tipo === 'pj' ? 'CNPJ' : 'CPF'}</label>
            <input id="cl-doc" className="input" value={form.cpf_cnpj} onChange={set('cpf_cnpj')} />
          </div>
          <div className="field">
            <label className="label" htmlFor="cl-tel">Telefone / WhatsApp</label>
            <input id="cl-tel" className="input" value={form.telefone} onChange={set('telefone')} placeholder="(79) 9…" />
          </div>
          <div className="field">
            <label className="label" htmlFor="cl-email">E-mail</label>
            <input id="cl-email" className="input" type="email" value={form.email} onChange={set('email')} />
          </div>
          <div className="field">
            <label className="label" htmlFor="cl-aniv">Aniversário</label>
            <input id="cl-aniv" className="input" type="date" value={form.aniversario} onChange={set('aniversario')} />
          </div>
          <div className="field">
            <label className="label" htmlFor="cl-cidade">Cidade</label>
            <input id="cl-cidade" className="input" value={form.cidade} onChange={set('cidade')} />
          </div>
          <div className="field">
            <label className="label" htmlFor="cl-uf">UF</label>
            <input id="cl-uf" className="input" maxLength={2} value={form.uf} onChange={set('uf')} placeholder="SE" />
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="cl-end">Endereço</label>
          <input id="cl-end" className="input" value={form.endereco} onChange={set('endereco')} placeholder="Rua, número, bairro" />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label className="label" htmlFor="cl-etapa">Estágio</label>
            <select id="cl-etapa" className="select" value={form.etapa} onChange={set('etapa')}>
              {ETAPAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 2 }}>
            <label className="label" htmlFor="cl-obs">Observações</label>
            <input id="cl-obs" className="input" value={form.observacoes} onChange={set('observacoes')} placeholder="Preferências, histórico, notas…" />
          </div>
        </div>

        {erro && <div className="badge badge-danger" style={{ marginBottom: 12 }}>{erro}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar cliente'}
          </button>
        </div>
      </div>
    </div>
  )
}
