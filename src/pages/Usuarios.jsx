import { useEffect, useState, useCallback } from 'react'
import { UserPlus, Copy, Check, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../hooks/usePermissions'

const ROLES = [
  { valor: 'dono', nome: 'Dono' },
  { valor: 'gerente', nome: 'Gerente' },
  { valor: 'vendedor', nome: 'Vendedor' },
  { valor: 'caixa', nome: 'Caixa' },
  { valor: 'estoquista', nome: 'Estoquista' },
]

export default function Usuarios() {
  const { empresa, profile } = useAuth()
  const { can } = usePermissions()
  const podeEditar = can('usuarios', 'editar')

  const [equipe, setEquipe] = useState(null)
  const [convites, setConvites] = useState([])
  const [novoEmail, setNovoEmail] = useState('')
  const [novoRole, setNovoRole] = useState('vendedor')
  const [copiado, setCopiado] = useState(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    const [{ data: membros }, { data: pend }] = await Promise.all([
      supabase.from('profiles').select('*').eq('empresa_id', empresa.id).order('criado_em'),
      supabase.from('convites').select('*').eq('empresa_id', empresa.id).eq('aceito', false).order('criado_em', { ascending: false }),
    ])
    setEquipe(membros ?? [])
    setConvites(pend ?? [])
  }, [empresa.id])

  useEffect(() => { carregar() }, [carregar])

  const convidar = async () => {
    setErro('')
    if (!novoEmail.includes('@')) { setErro('Informe um e-mail válido'); return }
    const { error } = await supabase.from('convites').insert({
      empresa_id: empresa.id, email: novoEmail.trim().toLowerCase(), role: novoRole,
    })
    if (error) { setErro(error.message); return }
    setNovoEmail('')
    carregar()
  }

  const copiarLink = async (token) => {
    const link = `${window.location.origin}/?convite=${token}`
    await navigator.clipboard.writeText(link)
    setCopiado(token)
    setTimeout(() => setCopiado(null), 1600)
  }

  const removerConvite = async (id) => {
    await supabase.from('convites').delete().eq('id', id)
    carregar()
  }

  const alterarRole = async (id, role) => {
    await supabase.from('profiles').update({ role }).eq('id', id)
    carregar()
  }

  const alternarAtivo = async (membro) => {
    await supabase.from('profiles').update({ ativo: !membro.ativo }).eq('id', membro.id)
    carregar()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Usuários</h1>
          <p className="page-sub">Equipe de {empresa?.nome}</p>
        </div>
      </div>

      {podeEditar && (
        <div className="card" style={{ padding: 18, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 220px' }}>
              <label className="label" htmlFor="conv-email">Convidar por e-mail</label>
              <input id="conv-email" className="input" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} placeholder="pessoa@empresa.com.br" />
            </div>
            <div style={{ flex: '0 1 160px' }}>
              <label className="label" htmlFor="conv-role">Função</label>
              <select id="conv-role" className="select" value={novoRole} onChange={(e) => setNovoRole(e.target.value)}>
                {ROLES.filter((r) => r.valor !== 'dono').map((r) => (
                  <option key={r.valor} value={r.valor}>{r.nome}</option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" onClick={convidar}>
              <UserPlus size={15} /> Gerar convite
            </button>
          </div>
          {erro && <div className="badge badge-danger" style={{ marginTop: 12 }}>{erro}</div>}
        </div>
      )}

      {convites.length > 0 && (
        <div className="card" style={{ marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
            Convites pendentes
          </div>
          <table className="table">
            <tbody>
              {convites.map((c) => (
                <tr key={c.id}>
                  <td>{c.email}</td>
                  <td><span className="badge badge-muted">{nomeRole(c.role)}</span></td>
                  <td style={{ width: 1, whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost" onClick={() => copiarLink(c.token)}>
                      {copiado === c.token ? <Check size={14} /> : <Copy size={14} />}
                      {copiado === c.token ? 'Copiado' : 'Copiar link'}
                    </button>{' '}
                    <button className="icon-btn" onClick={() => removerConvite(c.id)} aria-label="Remover convite">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        {equipe === null ? (
          <div style={{ padding: 16 }}>
            {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 44, marginBottom: 8 }} />)}
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Função</th>
                <th>Status</th>
                {podeEditar && <th></th>}
              </tr>
            </thead>
            <tbody>
              {equipe.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 500 }}>
                    {m.nome || '—'}
                    {m.id === profile.id && <span className="badge badge-accent" style={{ marginLeft: 8 }}>você</span>}
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{m.email}</td>
                  <td>
                    {podeEditar && m.id !== profile.id && m.role !== 'dono' ? (
                      <select className="select" style={{ width: 140 }} value={m.role} onChange={(e) => alterarRole(m.id, e.target.value)}>
                        {ROLES.filter((r) => r.valor !== 'dono').map((r) => (
                          <option key={r.valor} value={r.valor}>{r.nome}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="badge badge-muted">{nomeRole(m.role)}</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${m.ativo ? 'badge-success' : 'badge-danger'}`}>
                      {m.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  {podeEditar && (
                    <td style={{ width: 1, whiteSpace: 'nowrap' }}>
                      {m.id !== profile.id && m.role !== 'dono' && (
                        <button className="btn btn-ghost" onClick={() => alternarAtivo(m)}>
                          {m.ativo ? 'Desativar' : 'Reativar'}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function nomeRole(v) {
  return ROLES.find((r) => r.valor === v)?.nome ?? v
}
