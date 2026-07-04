import { NavLink } from 'react-router-dom'
import { NAV } from '../../lib/nav'
import { usePermissions } from '../../hooks/usePermissions'
import { useAuth } from '../../contexts/AuthContext'
import { LogoWP } from '../Logo'

export default function Sidebar({ open, onClose }) {
  const { can } = usePermissions()
  const { empresa } = useAuth()

  return (
    <>
      <div className={`sidebar-backdrop ${open ? 'open' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <LogoWP size={26} curto />
        </div>

        {NAV.map((group) => {
          const visiveis = group.items.filter((i) => can(i.modulo, 'ver'))
          if (!visiveis.length) return null
          return (
            <nav className="nav-group" key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {visiveis.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  onClick={onClose}
                >
                  <item.icon size={17} strokeWidth={1.9} />
                  {item.nome}
                  {!item.pronto && <span className="soon">Em breve</span>}
                </NavLink>
              ))}
            </nav>
          )
        })}

        <div className="sidebar-footer">
          <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '0 6px' }}>
            {empresa?.nome}
            <span className="badge badge-accent" style={{ marginLeft: 8, fontSize: 10 }}>
              {empresa?.plano}
            </span>
          </div>
        </div>
      </aside>
    </>
  )
}
