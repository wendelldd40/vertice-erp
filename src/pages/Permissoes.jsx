import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const MODULOS = [
  { id: 'dashboard', nome: 'Dashboard' },
  { id: 'vendas', nome: 'Vendas' },
  { id: 'pedidos', nome: 'Pedidos' },
  { id: 'clientes', nome: 'Clientes' },
  { id: 'produtos', nome: 'Produtos' },
  { id: 'estoque', nome: 'Estoque' },
  { id: 'compras', nome: 'Compras' },
  { id: 'financeiro', nome: 'Financeiro' },
  { id: 'relatorios', nome: 'Relatórios' },
  { id: 'usuarios', nome: 'Usuários' },
  { id: 'configuracoes', nome: 'Configurações' },
]

const ROLES = [
  { valor: 'gerente', nome: 'Gerente' },
  { valor: 'vendedor', nome: 'Vendedor' },
  { valor: 'caixa', nome: 'Caixa' },
  { valor: 'estoquista', nome: 'Estoquista' },
]

const ACOES = [
  { campo: 'pode_ver', nome: 'Ver' },
  { campo: 'pode_criar', nome: 'Criar' },
  { campo: 'pode_editar', nome: 'Editar' },
  { campo: 'pode_excluir', nome: 'Excluir' },
]

export default function Permissoes() {
  const { empresa, profile, recarregar } = useAuth()
  const ehDono = profile?.role === 'dono'

  const [roleAtiva, setRoleAtiva] = useState('gerente')
  const [perms, setPerms] = useState(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('permissoes').select('*')
      .eq('empresa_id', empresa.id).eq('role', roleAtiva)
    setPerms(data ?? [])
  }, [empresa.id, roleAtiva])

  useEffect(() => { setPerms(null); carregar() }, [carregar])

  const alternar = async (modulo, campo) => {
    if (!ehDono) return
    const atual = perms.find((p) => p.modulo === modulo)
    if (!atual) return
    const novoValor = !atual[campo]

    // Otimista: UI responde na hora, banco confirma em seguida
    setPerms((ps) => ps.map((p) => (p.modulo === modulo ? { ...p, [campo]: novoValor } : p)))
    setSalvando(true)
    const { error } = await supabase
      .from('permissoes').update({ [campo]: novoValor }).eq('id', atual.id)
    setSalvando(false)
    if (error) {
      // Reverte em caso de falha
      setPerms((ps) => ps.map((p) => (p.modulo === modulo ? { ...p, [campo]: !novoValor } : p)))
    } else {
      recarregar()
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Permissões</h1>
          <p className="page-sub">
            O que cada função pode fazer em cada módulo. O Dono sempre tem acesso total.
          </p>
        </div>
        {salvando && <span className="badge badge-muted">Salvando…</span>}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {ROLES.map((r) => (
          <button
            key={r.valor}
            className={`btn ${roleAtiva === r.valor ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setRoleAtiva(r.valor)}
          >
            {r.nome}
          </button>
        ))}
      </div>

      {!ehDono && (
        <div className="badge badge-warn" style={{ marginBottom: 14 }}>
          Somente o Dono pode alterar permissões. Você está em modo de visualização.
        </div>
      )}

      <div className="card perm-grid" style={{ overflow: 'auto' }}>
        {perms === null ? (
          <div style={{ padding: 16 }}>
            {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 40, marginBottom: 8 }} />)}
          </div>
        ) : (
          <table className="table" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th>Módulo</th>
                {ACOES.map((a) => <th key={a.campo} style={{ textAlign: 'center' }}>{a.nome}</th>)}
              </tr>
            </thead>
            <tbody>
              {MODULOS.map((m) => {
                const p = perms.find((x) => x.modulo === m.id)
                return (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 500 }}>{m.nome}</td>
                    {ACOES.map((a) => (
                      <td key={a.campo} style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          className="perm-check"
                          checked={p ? !!p[a.campo] : false}
                          disabled={!ehDono || !p}
                          onChange={() => alternar(m.id, a.campo)}
                          aria-label={`${m.nome}: ${a.nome}`}
                        />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
