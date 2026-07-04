import { Search, Sun, Moon, Menu, LogOut } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useState, useRef, useEffect } from 'react'

export default function Topbar({ onOpenPalette, onToggleMenu, theme, onToggleTheme }) {
  const { profile, sair } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const fechar = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [])

  const iniciais = (profile?.nome || profile?.email || '?')
    .split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

  return (
    <header className="topbar">
      <button className="icon-btn menu-toggle" onClick={onToggleMenu} aria-label="Abrir menu">
        <Menu size={19} />
      </button>

      <button className="topbar-search" onClick={onOpenPalette}>
        <Search size={15} />
        Buscar em tudo…
        <kbd>Ctrl K</kbd>
      </button>

      <div className="topbar-right">
        <button className="icon-btn" onClick={onToggleTheme} aria-label="Alternar tema">
          {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
        </button>

        <div style={{ position: 'relative' }} ref={menuRef}>
          <button className="avatar" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu do usuário">
            {iniciais}
          </button>
          {menuOpen && (
            <div
              className="card"
              style={{
                position: 'absolute', right: 0, top: 42, width: 220,
                padding: 8, zIndex: 30,
              }}
            >
              <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', marginBottom: 6 }}>
                <div style={{ fontWeight: 600 }}>{profile?.nome || 'Usuário'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{profile?.email}</div>
                <span className="badge badge-muted" style={{ marginTop: 6 }}>{profile?.role}</span>
              </div>
              <button
                className="btn btn-ghost"
                style={{ width: '100%', justifyContent: 'flex-start', border: 'none' }}
                onClick={sair}
              >
                <LogOut size={15} /> Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
