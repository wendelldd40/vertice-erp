import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Protected from './components/Protected'
import AppLayout from './components/layout/AppLayout'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Usuarios from './pages/Usuarios'
import Permissoes from './pages/Permissoes'
import EmBreve from './pages/EmBreve'
import Produtos from './pages/Produtos'
import ProdutoForm from './pages/ProdutoForm'
import Categorias from './pages/Categorias'
import Estoque from './pages/Estoque'
import PDV from './pages/PDV'
import Vendas from './pages/Vendas'
import Lancamentos from './pages/Lancamentos'
import FluxoCaixa from './pages/FluxoCaixa'
import Caixa from './pages/Caixa'
import Clientes from './pages/Clientes'
import ClienteDetalhe from './pages/ClienteDetalhe'
import Compras from './pages/Compras'
import Fornecedores from './pages/Fornecedores'
import Relatorios from './pages/Relatorios'
import Integracoes from './pages/Integracoes'

function OnboardingGate() {
  const { session, profile, loading } = useAuth()
  if (loading) return null
  if (!session) return <Navigate to="/login" replace />
  if (profile?.empresa_id) return <Navigate to="/" replace />
  return <Onboarding />
}

function LoginGate() {
  const { session, profile, loading } = useAuth()
  if (loading) return null
  if (session && profile?.empresa_id) return <Navigate to="/" replace />
  if (session && profile && !profile.empresa_id) return <Navigate to="/onboarding" replace />
  return <Login />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginGate />} />
          <Route path="/onboarding" element={<OnboardingGate />} />
          <Route element={<Protected><AppLayout /></Protected>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pdv" element={<PDV />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/clientes/:id" element={<ClienteDetalhe />} />
            <Route path="/vendas" element={<Vendas />} />
            <Route path="/produtos" element={<Produtos />} />
            <Route path="/produtos/novo" element={<ProdutoForm />} />
            <Route path="/produtos/:id" element={<ProdutoForm />} />
            <Route path="/categorias" element={<Categorias />} />
            <Route path="/estoque" element={<Estoque />} />
            <Route path="/compras" element={<Compras />} />
            <Route path="/fornecedores" element={<Fornecedores />} />
            <Route path="/relatorios" element={<Relatorios />} />
            <Route path="/caixa" element={<Caixa />} />
            <Route path="/contas-pagar" element={<Lancamentos tipo="despesa" key="despesa" />} />
            <Route path="/contas-receber" element={<Lancamentos tipo="receita" key="receita" />} />
            <Route path="/fluxo-caixa" element={<FluxoCaixa />} />
            <Route path="/integracoes" element={<Integracoes />} />
            <Route path="/usuarios" element={<Usuarios />} />
            <Route path="/permissoes" element={<Permissoes />} />
            <Route path="*" element={<EmBreve />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
