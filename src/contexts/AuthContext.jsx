import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [empresa, setEmpresa] = useState(null)
  const [permissoes, setPermissoes] = useState([])
  const [loading, setLoading] = useState(true)

  const carregarContexto = useCallback(async (userId) => {
    const { data: prof } = await supabase
      .from('profiles').select('*').eq('id', userId).single()
    setProfile(prof ?? null)

    if (prof?.empresa_id) {
      const [{ data: emp }, { data: perms }] = await Promise.all([
        supabase.from('empresas').select('*').eq('id', prof.empresa_id).single(),
        supabase.from('permissoes').select('*')
          .eq('empresa_id', prof.empresa_id).eq('role', prof.role),
      ])
      setEmpresa(emp ?? null)
      setPermissoes(perms ?? [])
    } else {
      setEmpresa(null)
      setPermissoes([])
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      if (session?.user) await carregarContexto(session.user.id)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session)
        if (session?.user) await carregarContexto(session.user.id)
        else { setProfile(null); setEmpresa(null); setPermissoes([]) }
      }
    )
    return () => subscription.unsubscribe()
  }, [carregarContexto])

  const recarregar = useCallback(async () => {
    if (session?.user) await carregarContexto(session.user.id)
  }, [session, carregarContexto])

  const sair = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ session, profile, empresa, permissoes, loading, recarregar, sair }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
