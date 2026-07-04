import {
  LayoutDashboard, Zap, ShoppingCart, ClipboardList, Users, Package, Layers,
  Boxes, Truck, Building2, Wallet, ArrowDownCircle, ArrowUpCircle,
  TrendingUp, BarChart3, UserCog, ShieldCheck, Plug, Settings,
} from 'lucide-react'

// pronto=false exibe badge "Em breve" e leva a uma tela placeholder.
export const NAV = [
  {
    label: 'Principal',
    items: [
      { to: '/', nome: 'Dashboard', icon: LayoutDashboard, modulo: 'dashboard', pronto: true },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { to: '/pdv', nome: 'Venda rápida', icon: Zap, modulo: 'vendas', pronto: true },
      { to: '/vendas', nome: 'Vendas', icon: ShoppingCart, modulo: 'vendas', pronto: true },
      { to: '/pedidos', nome: 'Pedidos', icon: ClipboardList, modulo: 'pedidos', pronto: false },
      { to: '/clientes', nome: 'Clientes', icon: Users, modulo: 'clientes', pronto: true },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      { to: '/produtos', nome: 'Produtos', icon: Package, modulo: 'produtos', pronto: true },
      { to: '/categorias', nome: 'Categorias', icon: Layers, modulo: 'produtos', pronto: true },
      { to: '/estoque', nome: 'Estoque', icon: Boxes, modulo: 'estoque', pronto: true },
    ],
  },
  {
    label: 'Suprimentos',
    items: [
      { to: '/compras', nome: 'Compras', icon: Truck, modulo: 'compras', pronto: true },
      { to: '/fornecedores', nome: 'Fornecedores', icon: Building2, modulo: 'compras', pronto: true },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { to: '/caixa', nome: 'Caixa', icon: Wallet, modulo: 'financeiro', pronto: true },
      { to: '/contas-pagar', nome: 'Contas a pagar', icon: ArrowDownCircle, modulo: 'financeiro', pronto: true },
      { to: '/contas-receber', nome: 'Contas a receber', icon: ArrowUpCircle, modulo: 'financeiro', pronto: true },
      { to: '/fluxo-caixa', nome: 'Fluxo de caixa', icon: TrendingUp, modulo: 'financeiro', pronto: true },
    ],
  },
  {
    label: 'Análise',
    items: [
      { to: '/relatorios', nome: 'Relatórios', icon: BarChart3, modulo: 'relatorios', pronto: true },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/usuarios', nome: 'Usuários', icon: UserCog, modulo: 'usuarios', pronto: true },
      { to: '/permissoes', nome: 'Permissões', icon: ShieldCheck, modulo: 'usuarios', pronto: true },
      { to: '/integracoes', nome: 'Integrações', icon: Plug, modulo: 'configuracoes', pronto: true },
      { to: '/configuracoes', nome: 'Configurações', icon: Settings, modulo: 'configuracoes', pronto: false },
    ],
  },
]
