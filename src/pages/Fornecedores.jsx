import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../hooks/usePermissions'

export default function Fornecedores() {
  const { empresa } = useAuth()
  const { can } = usePermissions()
  const [lista, setLista] = useState(null)
  const [modal, setModal] = useState(null) // null | {} | fornecedor

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('fornecedores')
      .select('*')
      .eq('empresa_id', empresa.id)
      .order('nome')
    setLista(data ?? [])
  }, [empresa.id])

  useEffect(() => { carregar() }, [carregar])

  const excluir = async (f) => {
    if (!window.confirm(`Excluir "${f.nome}"? As compras dele são mantidas no histórico.`)) return
    await supabase.from('fornecedores').delete().eq('id', f.id)
    carregar()
  }

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Fornecedores</h1>
          <p className="page-sub">Quem abastece a sua loja.</p>
        </div>
        {can('compras', 'criar') && (
          <button className="btn btn-primary" onClick={() => setModal({})}>
            <Plus size={15} /> Novo fornecedor
          </button>
        )}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {lista === null ? (
          <div style={{ padding: 16 }}>
            {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 42, marginBottom: 8 }} />)}
          </div>
        ) : lista.length === 0 ? (
          <div className="empty"><strong>Nenhum fornecedor ainda</strong>Cadastre o primeiro no botão acima.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Contato</th>
                <th>Cidade</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((f) => (
                <tr key={f.id}>
                  <td style={{ fontWeight: 500 }}>
                    {f.nome}
                    {f.cnpj && <span style={{ color: 'var(--text-faint)', marginLeft: 8, fontSize: 12 }}>{f.cnpj}</span>}
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{f.telefone || f.email || '—'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{[f.cidade, f.uf].filter(Boolean).join('/') || '—'}</td>
                  <td style={{ width: 1, whiteSpace: 'nowrap' }}>
                    {can('compras', 'editar') && (
                      <button className="icon-btn" onClick={() => setModal(f)} aria-label={`Editar ${f.nome}`}>
                        <Pencil size={15} />
                      </button>
                    )}
                    {can('compras', 'excluir') && (
                      <button className="icon-btn" onClick={() => excluir(f)} aria-label={`Excluir ${f.nome}`}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal !== null && (
        <ModalFornecedor
          fornecedor={modal.id ? modal : null}
          onClose={() => setModal(null)}
          onSalvo={() => { setModal(null); carregar() }}
        />
      )}
    </div>
  )
}

function ModalFornecedor({ fornecedor, onClose, onSalvo }) {
  const { empresa } = useAuth()
  const editando = !!fornecedor
  const [form, setForm] = useState({
    nome: fornecedor?.nome ?? '', cnpj: fornecedor?.cnpj ?? '',
    telefone: fornecedor?.telefone ?? '', email: fornecedor?.email ?? '',
    cidade: fornecedor?.cidade ?? '', uf: fornecedor?.uf ?? '',
    observacoes: fornecedor?.observacoes ?? '',
  })
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const set = (c) => (e) => setForm((f) => ({ ...f, [c]: e.target.value }))

  const salvar = async () => {
    if (!form.nome.trim()) { setErro('Informe o nome'); return }
    setErro('')
    setSalvando(true)
    const payload = {
      empresa_id: empresa.id, nome: form.nome.trim(),
      cnpj: form.cnpj || null, telefone: form.telefone || null,
      email: form.email || null, cidade: form.cidade || null,
      uf: form.uf || null, observacoes: form.observacoes || null,
    }
    const q = editando
      ? supabase.from('fornecedores').update(payload).eq('id', fornecedor.id)
      : supabase.from('fornecedores').insert(payload)
    const { error } = await q
    setSalvando(false)
    if (error) { setErro(error.message); return }
    onSalvo()
  }

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" style={{ padding: 22, width: 'min(540px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>{editando ? 'Editar fornecedor' : 'Novo fornecedor'}</h2>
        <div className="field">
          <label className="label" htmlFor="fn-nome">Nome *</label>
          <input id="fn-nome" className="input" autoFocus value={form.nome} onChange={set('nome')} placeholder="Distribuidora Exemplo" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <div className="field">
            <label className="label" htmlFor="fn-cnpj">CNPJ</label>
            <input id="fn-cnpj" className="input" value={form.cnpj} onChange={set('cnpj')} />
          </div>
          <div className="field">
            <label className="label" htmlFor="fn-tel">Telefone</label>
            <input id="fn-tel" className="input" value={form.telefone} onChange={set('telefone')} />
          </div>
          <div className="field">
            <label className="label" htmlFor="fn-email">E-mail</label>
            <input id="fn-email" className="input" type="email" value={form.email} onChange={set('email')} />
          </div>
          <div className="field">
            <label className="label" htmlFor="fn-cidade">Cidade</label>
            <input id="fn-cidade" className="input" value={form.cidade} onChange={set('cidade')} />
          </div>
          <div className="field">
            <label className="label" htmlFor="fn-uf">UF</label>
            <input id="fn-uf" className="input" maxLength={2} value={form.uf} onChange={set('uf')} />
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="fn-obs">Observações</label>
          <input id="fn-obs" className="input" value={form.observacoes} onChange={set('observacoes')} placeholder="Prazo de entrega, condições…" />
        </div>
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
