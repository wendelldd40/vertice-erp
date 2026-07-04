import { useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'

const ACOES = { ver: 'pode_ver', criar: 'pode_criar', editar: 'pode_editar', excluir: 'pode_excluir' }

/**
 * Hook central de permissões.
 * const { can } = usePermissions()
 * can('estoque', 'editar') -> boolean
 */
export function usePermissions() {
  const { permissoes, profile } = useAuth()

  const can = useCallback((modulo, acao = 'ver') => {
    if (profile?.role === 'dono') return true
    const p = permissoes.find((x) => x.modulo === modulo)
    return p ? !!p[ACOES[acao]] : false
  }, [permissoes, profile])

  return { can, role: profile?.role }
}
