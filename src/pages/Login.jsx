import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { LogoWP } from '../components/Logo'

export default function Login() {
  const [modo, setModo] = useState('entrar') // entrar | criar
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [params] = useSearchParams()
  const { recarregar } = useAuth()
  const convite = params.get('convite')

  const enviar = async () => {
    setErro('')
    setCarregando(true)
    try {
      if (modo === 'criar') {
        const { error } = await supabase.auth.signUp({
          email, password: senha,
          options: { data: { nome } },
        })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
        if (error) throw error
      }
      // Se veio por link de convite, vincula à empresa
      if (convite) {
        const { error } = await supabase.rpc('aceitar_convite', { p_token: convite })
        if (error) throw error
        await recarregar()
      }
    } catch (e) {
      setErro(traduzir(e.message))
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="auth-brand">
          <LogoWP size={30} />
        </div>

        {convite && (
          <div className="badge badge-accent" style={{ marginBottom: 18 }}>
            Você foi convidado para uma empresa
          </div>
        )}

        <h1 style={{ fontSize: 18, marginBottom: 4 }}>
          {modo === 'entrar' ? 'Bem-vindo de volta' : 'Criar conta'}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 22 }}>
          {modo === 'entrar'
            ? 'Acesse o painel da sua empresa.'
            : 'Leva menos de um minuto.'}
        </p>

        {modo === 'criar' && (
          <div className="field">
            <label className="label" htmlFor="nome">Seu nome</label>
            <input id="nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Maria Silva" />
          </div>
        )}
        <div className="field">
          <label className="label" htmlFor="email">E-mail</label>
          <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com.br" />
        </div>
        <div className="field">
          <label className="label" htmlFor="senha">Senha</label>
          <input
            id="senha" className="input" type="password" value={senha}
            onChange={(e) => setSenha(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && enviar()}
            placeholder="••••••••"
          />
        </div>

        {erro && <div className="badge badge-danger" style={{ marginBottom: 14 }}>{erro}</div>}

        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={enviar} disabled={carregando}>
          {carregando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar no painel' : 'Criar conta'}
        </button>

        <p style={{ marginTop: 18, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
          {modo === 'entrar' ? (
            <>Ainda não tem conta?{' '}
              <a href="#criar" onClick={(e) => { e.preventDefault(); setModo('criar'); setErro('') }}>Criar conta</a>
            </>
          ) : (
            <>Já tem conta?{' '}
              <a href="#entrar" onClick={(e) => { e.preventDefault(); setModo('entrar'); setErro('') }}>Entrar</a>
            </>
          )}
        </p>
      </div>
    </div>
  )
}

function traduzir(msg = '') {
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos'
  if (msg.includes('already registered')) return 'Este e-mail já está cadastrado'
  if (msg.includes('at least 6 characters')) return 'A senha precisa ter pelo menos 6 caracteres'
  if (msg.includes('Convite inválido')) return 'Convite inválido ou expirado'
  return msg || 'Algo deu errado. Tente novamente.'
}
