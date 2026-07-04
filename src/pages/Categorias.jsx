import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../hooks/usePermissions'

export default function Categorias() {
  const { empresa } = useAuth()
  const { can } = usePermissions()
  const [lista, setLista] = useState(null)
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('categorias')
      .select('id, nome, produtos(count)')
      .eq('empresa_id', empresa.id)
      .order('nome')
    setLista(data ?? [])
  }, [empresa.id])

  useEffect(() => { carregar() }, [carregar])

  const adicionar = async () => {
    setErro('')
    if (!nome.trim()) return
    const { error } = await supabase.from('categorias').insert({ empresa_id: empresa.id, nome: nome.trim() })
    if (error) {
      setErro(error.message.includes('duplicate') ? 'Essa categoria já existe' : error.message)
      return
    }
    setNome('')
    carregar()
  }

  const remover = async (cat) => {
    const qtd = cat.produtos?.[0]?.count ?? 0
    const msg = qtd > 0
      ? `Excluir "${cat.nome}"? Os ${qtd} produtos dela ficarão sem categoria (não serão excluídos).`
      : `Excluir "${cat.nome}"?`
    if (!window.confirm(msg)) return
    await supabase.from('categorias').delete().eq('id', cat.id)
    carregar()
  }

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Categorias</h1>
          <p className="page-sub">Organize o catálogo para filtrar e analisar por grupo.</p>
        </div>
      </div>

      {can('produtos', 'criar') && (
        <div className="card" style={{ padding: 16, marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              className="input" value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && adicionar()}
              placeholder="Nova categoria (ex.: Rações, Higiene, Acessórios)"
            />
            <button className="btn btn-primary" onClick={adicionar}><Plus size={15} /> Adicionar</button>
          </div>
          {erro && <div className="badge badge-danger" style={{ marginTop: 10 }}>{erro}</div>}
        </div>
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        {lista === null ? (
          <div style={{ padding: 16 }}>
            {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 42, marginBottom: 8 }} />)}
          </div>
        ) : lista.length === 0 ? (
          <div className="empty"><strong>Nenhuma categoria ainda</strong>Crie a primeira acima.</div>
        ) : (
          <table className="table">
            <tbody>
              {lista.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.nome}</td>
                  <td style={{ color: 'var(--text-muted)' }}>
                    {c.produtos?.[0]?.count ?? 0} produtos
                  </td>
                  {can('produtos', 'excluir') && (
                    <td style={{ width: 1 }}>
                      <button className="icon-btn" onClick={() => remover(c)} aria-label={`Excluir ${c.nome}`}>
                        <Trash2 size={15} />
                      </button>
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
