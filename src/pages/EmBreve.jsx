import { useLocation } from 'react-router-dom'
import { Hammer } from 'lucide-react'

export default function EmBreve() {
  const { pathname } = useLocation()
  const nome = pathname.replace('/', '').replace(/-/g, ' ')
  return (
    <div className="page">
      <div className="card empty" style={{ paddingTop: 64, paddingBottom: 64 }}>
        <Hammer size={28} style={{ color: 'var(--text-faint)', marginBottom: 12 }} />
        <strong style={{ textTransform: 'capitalize' }}>{nome}</strong>
        Este módulo está em construção e chega nas próximas versões.
      </div>
    </div>
  )
}
