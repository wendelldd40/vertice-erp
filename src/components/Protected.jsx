import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Protected({ children }) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="auth-wrap">
        <div style={{ width: 320 }}>
          <div className="skeleton" style={{ height: 44, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 44, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 44 }} />
        </div>
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  if (profile && !profile.empresa_id) return <Navigate to="/onboarding" replace />
  return children
}
