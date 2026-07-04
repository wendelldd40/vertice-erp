import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NAV } from '../lib/nav'
import { usePermissions } from '../hooks/usePermissions'

// Normaliza acentos para busca ("credito" encontra "Crédito")
const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export default function CommandPalette({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const { can } = usePermissions()

  const itens = useMemo(() => {
    const todos = NAV.flatMap((g) =>
      g.items
        .filter((i) => can(i.modulo, 'ver'))
        .map((i) => ({ ...i, grupo: g.label }))
    )
    if (!query) return todos
    return todos.filter((i) => norm(i.nome).includes(norm(query)))
  }, [query, can])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  useEffect(() => setSelected(0), [query])

  if (!open) return null

  const executar = (item) => {
    if (item) {
      navigate(item.to)
      onClose()
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, itens.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)) }
    if (e.key === 'Enter') { e.preventDefault(); executar(itens[selected]) }
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Ir para… (setas para navegar, Enter para abrir)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="palette-list">
          {itens.length === 0 && (
            <div className="empty" style={{ padding: 24 }}>
              Nada encontrado para “{query}”.
            </div>
          )}
          {itens.map((item, i) => (
            <div
              key={item.to}
              className={`palette-item ${i === selected ? 'selected' : ''}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => executar(item)}
            >
              <item.icon size={16} strokeWidth={1.9} />
              {item.nome}
              <span className="group">{item.grupo}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
