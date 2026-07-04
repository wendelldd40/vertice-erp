// Símbolo WP — "Proposta V2" do brand book: órbita simplificada em gradiente.
// Quando o SVG/PNG oficial da esfera estiver disponível, basta trocar aqui.
export function MarcaWP({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="wpgrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2E4BF2" />
          <stop offset="52%" stopColor="#7B2FD4" />
          <stop offset="100%" stopColor="#E01E9B" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill="url(#wpgrad)" />
      {/* fitas orbitais: recortes em arco */}
      <path d="M2.5 19 Q 24 8, 45.5 17" stroke="rgba(10,10,17,0.92)" strokeWidth="4.4" fill="none" strokeLinecap="round" />
      <path d="M2.5 31 Q 24 22, 45.5 29" stroke="rgba(10,10,17,0.92)" strokeWidth="4.4" fill="none" strokeLinecap="round" />
      <path d="M8 41 Q 24 34, 42 39.5" stroke="rgba(10,10,17,0.92)" strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
  )
}

export function LogoWP({ size = 28, curto = false }) {
  return (
    <>
      <MarcaWP size={size} />
      <span>
        {curto ? 'WP' : 'WORLD PROJECT'} <span className="store">store</span>
      </span>
    </>
  )
}
