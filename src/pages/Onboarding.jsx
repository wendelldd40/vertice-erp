import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { LogoWP } from '../components/Logo'

export default function Onboarding() {
  const [nome, setNome] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const { recarregar, sair } = useAuth()

  const criar = async () => {
    if (!nome.trim()) { setErro('Informe o nome da empresa'); return }
    setErro('')
    setCarregando(true)
    const { error } = await supabase.rpc('criar_empresa', {
      p_nome: nome.trim(),
      p_cnpj: cnpj.trim() || null,
    })
    if (error) { setErro(error.message); setCarregando(false); return }
    await recarregar()
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="auth-brand">
          <LogoWP size={30} />
        </div>
        <h1 style={{ fontSize: 18, marginBottom: 4 }}>Cadastre sua empresa</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 22 }}>
          Ela será o espaço de trabalho da sua equipe. Você poderá convidar pessoas depois.
        </p>

        <div className="field">
          <label className="label" htmlFor="empresa">Nome da empresa</label>
          <input id="empresa" className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Loja Exemplo" />
        </div>
        <div className="field">
          <label className="label" htmlFor="cnpj">CNPJ <span style={{ color: 'var(--text-faint)' }}>(opcional)</span></label>
          <input id="cnpj" className="input" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
        </div>

        {erro && <div className="badge badge-danger" style={{ marginBottom: 14 }}>{erro}</div>}

        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={criar} disabled={carregando}>
          {carregando ? 'Criando…' : 'Criar empresa'}
        </button>

        <p style={{ marginTop: 18, fontSize: 13, textAlign: 'center' }}>
          <a href="#sair" onClick={(e) => { e.preventDefault(); sair() }} style={{ color: 'var(--text-muted)' }}>
            Sair da conta
          </a>
        </p>
      </div>
    </div>
  )
}
