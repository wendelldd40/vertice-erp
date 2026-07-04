# World Project Store ERP — Módulos 1 a 10

SaaS multi-empresa para gestão de comércio. Stack: Vite + React + Supabase.

## O que está pronto neste módulo

- Autenticação (login e criação de conta) com fluxo de convite por link
- Onboarding: criação da empresa (tenant) com permissões padrão semeadas
- Multi-tenancy real: RLS no Postgres isola os dados de cada empresa no banco, não só no front
- 5 funções: Dono, Gerente, Vendedor, Caixa, Estoquista
- Matriz visual de permissões (função × módulo × ação) com salvamento otimista
- Gestão de equipe: convites com link copiável, troca de função, desativação
- Layout base: sidebar agrupada, topbar, busca global Ctrl+K, dark/light mode, responsivo

## Novidades do Módulo 2 (Produtos + Estoque)

- Cadastro rápido de produto (nome + preço + estoque inicial) em modal — vendável em segundos
- Cadastro completo em seções (Essencial, Preços, Fiscal, Dimensões) com margem e markup em tempo real
- Lista com busca instantânea (nome, SKU, código de barras), filtros e paginação
- Categorias com contagem de produtos
- Estoque com saldos por depósito e situação (ok / abaixo do mínimo / zerado)
- Movimentações auditáveis: entrada, saída, ajuste por contagem e transferência entre depósitos
- Saldo NUNCA é editado diretamente: toda escrita passa pela RPC `movimentar_estoque`, que valida saldo, registra autor/motivo e é atômica (transferência não deixa o banco inconsistente)
- Permissão checada também no banco (`tem_permissao`) dentro das policies de escrita

## Novidades do Módulo 3 (PDV / Vendas)

- Venda rápida 100% por teclado: bipe o código de barras (leitor envia Enter), F2 abre o pagamento, teclas 1–4 escolhem a forma (Dinheiro/PIX/Débito/Crédito), Enter confirma
- Catálogo carregado em memória: busca e bipagem respondem instantaneamente
- Cálculo de troco em tempo real, desconto em R$, cliente opcional
- RPC `registrar_venda` atômica: venda + itens + baixa de estoque + auditoria numa transação única, com numeração sequencial por empresa protegida por lock
- Cancelamento com estorno automático de estoque, rastreado no histórico de movimentações
- Snapshot do nome/preço do produto nos itens: renomear produto não altera vendas passadas
- Histórico de vendas com detalhes expandíveis (itens, desconto, vendedor)

## Novidades do Módulo 4 (Financeiro)

- Integração automática venda → financeiro via trigger no Postgres: dinheiro/PIX/débito viram receita paga na hora; crédito vira contas a receber com vencimento em 30 dias; venda cancelada cancela o lançamento junto
- Contas a pagar e a receber com filtro por mês/status, badge de atraso e baixa em um clique
- Parcelamento nativo: um lançamento em até 48 parcelas mensais (a última ajusta os centavos)
- Categorias financeiras com padrões semeados por empresa (Vendas, Fornecedores, Aluguel, Salários…)
- Fluxo de caixa em dois regimes: realizado (pago no mês) e previsto (vence no mês), com quebra por categoria
- Caixa do dia: faturamento, ticket médio, recebimentos por forma de pagamento e saldo do dia
- Lançamentos vindos de venda são protegidos: só saem cancelando a venda (consistência garantida no banco)

## Novidades do Módulo 5 (Dashboard)

- RPC única `dashboard_resumo()` agrega todos os KPIs em UMA viagem ao banco — dashboard instantâneo
- Faturamento hoje / 7 dias / mês, cada um com variação % vs período anterior (seta verde/vermelha)
- Quantidade de vendas e ticket médio do mês
- Gráfico SVG de vendas dos últimos 30 dias (sem lib de gráfico: bundle continua leve)
- Top 5 produtos por faturamento nos últimos 30 dias
- Alertas: produtos abaixo do estoque mínimo, contas a receber/pagar dos próximos 7 dias e lançamentos atrasados

## Novidades do Módulo 6 (Clientes + Fotos)

- CRM com Kanban de relacionamento (Lead → Em contato → Negociação → Cliente ativo → Inativo), drag and drop nativo com atualização otimista, e toggle Kanban/Lista (preferência salva)
- Cadastro completo: PF/PJ, CPF/CNPJ, contato, aniversário, endereço, observações
- Ficha do cliente com KPIs em 1 viagem (RPC `cliente_resumo`): total gasto, nº de compras, ticket médio, última compra + histórico de vendas
- PDV agora vincula cliente de verdade: autocomplete busca o cadastro; venda alimenta a ficha automaticamente (texto livre continua aceito)
- Fotos de produtos via Supabase Storage: bucket público para leitura, escrita restrita à pasta da própria empresa (política por tenant no Postgres)
- Thumbnails na lista de produtos e na busca do PDV — bater o olho evita vender o item errado

## Novidades dos Módulos 7 e 8 (Compras + Relatórios)

**Compras + Fornecedores**
- Cadastro de fornecedores (CNPJ, contato, observações)
- Pedido de compra com autocomplete de produtos e custo sugerido pelo cadastro
- Receber a compra = 3 ações numa transação: entrada auditada no estoque + atualização do preço de custo do produto (margem sempre honesta) + conta a pagar gerada com vencimento escolhido
- Numeração sequencial por empresa com lock; cancelamento só de pedidos pendentes

**Relatórios**
- Vendas por período: faturamento, ticket, descontos, quebras por forma de pagamento, vendedor e dia
- Curva ABC calculada no Postgres (A = até 80% do faturamento acumulado, B = 80–95%, C = cauda)
- Estoque: valor a custo e a venda, lucro potencial e produtos parados (saldo sem venda há 30+ dias)
- Exportação CSV com BOM UTF-8 e separador ponto-e-vírgula — abre perfeito no Excel brasileiro

## Novidades do Módulo 9 (Integrações — fase 1)

- Hub de Integrações com status de cada conexão
- **Webhook de vendas**: cada venda (e cancelamento) dispara um POST JSON assíncrono via pg_net para a URL configurada (Make, n8n, Zapier) — nunca atrasa nem trava uma venda
- **WhatsApp sem API**: comprovante de venda na tela de sucesso do PDV e botão de cobrança com mensagem pronta em cada conta a receber
- **Importação de produtos via CSV**: detecta separador (, ou ;), aceita decimais BR (12,50), prévia antes de importar, inserção em lotes de 200
- **Exportação de produtos** em CSV (serve de modelo para a importação)
- Marketplaces (Mercado Livre, Shopee, Amazon) mapeados como fase 2 — exigem credenciais de desenvolvedor e Edge Functions

## Novidades do Módulo 10 (Mercado Livre)

- Conexão OAuth com a conta do vendedor (tokens guardados no servidor, fora do alcance do navegador)
- Vínculo anúncio ↔ produto do Vértice em uma tela
- Sincronização de estoque Vértice → ML (saldo total por produto vira available_quantity)
- Pedidos do ML chegam sozinhos via webhook de notificações e ficam na fila para processar
- Renovação automática de token (refresh) dentro das Edge Functions

### Setup do Mercado Livre (uma vez)

1. Crie um app em https://developers.mercadolivre.com.br → Minhas aplicações.
   - Redirect URI: `https://SEU-PROJETO.supabase.co/functions/v1/ml-oauth`
   - URL de notificações (tópico orders_v2): `https://SEU-PROJETO.supabase.co/functions/v1/ml-webhook`
2. Instale a CLI do Supabase e vincule o projeto: `supabase link --project-ref SEU-REF`
3. Configure os segredos:
   ```bash
   supabase secrets set ML_CLIENT_ID=seu_app_id ML_CLIENT_SECRET=seu_secret APP_URL=https://seu-app.vercel.app
   ```
4. Faça o deploy das funções:
   ```bash
   supabase functions deploy ml-oauth --no-verify-jwt
   supabase functions deploy ml-webhook --no-verify-jwt
   supabase functions deploy ml
   ```
5. Adicione no `.env` do front: `VITE_ML_APP_ID=seu_app_id` (e na Vercel também)
6. Rode a migration `010_marketplace.sql`, abra Integrações e clique em "Conectar conta do Mercado Livre".

## Identidade visual — World Project Store

O sistema segue o Brand Book v1.0 da WP, adaptado ao produto:
- Tipografia: Space Grotesk (títulos e KPIs), Manrope (corpo/UI), JetBrains Mono (labels técnicos, cabeçalhos de tabela)
- Paleta: Cobalt #2E4BF2 como ação, gradiente WP 135° (Cobalt → Amethyst → Fuchsia) apenas como acento — botões primários, item ativo do menu, avatar e símbolo
- Sidebar sempre Obsidian com item ativo em gradiente (como no mockup de dashboard do manual)
- Telas de login/onboarding escuras com glow ("Bem-vindo de volta" / "Entrar no painel")
- Símbolo: versão V2 (órbita simplificada) do próprio brand book, em SVG — para usar a esfera oficial, troque o desenho em `src/components/Logo.jsx`
- Raios 10–14px, foco em anel Amethyst, dark/light mode mantidos

## Setup (5 minutos)

1. Crie um projeto no Supabase.
2. No SQL Editor, execute em ordem: `001` a `010` (pasta `supabase/migrations`).
3. Em Authentication → Providers → Email, desative "Confirm email" durante o desenvolvimento (ou configure SMTP).
4. Copie `.env.example` para `.env` e preencha com a URL e a anon key do projeto (Settings → API).
5. Rode:

```bash
npm install
npm run dev
```

6. Crie sua conta, cadastre a empresa e pronto. Convide um segundo usuário pela tela de Usuários para testar as permissões.

## Deploy na Vercel

- Importe o repositório, framework preset **Vite**.
- Adicione as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
- Em Settings → Rewrites (ou `vercel.json`), aponte todas as rotas para `/index.html` (SPA):

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

## Convenções do projeto

- **Todo dado de negócio tem `empresa_id` + policy RLS.** Nunca crie tabela sem isso.
- Permissões são checadas em dois lugares: no front (`usePermissions().can(modulo, acao)`) para esconder UI, e no banco (RLS) para garantir segurança de verdade.
- Novos módulos entram em `src/pages/` + rota em `App.jsx` + item em `src/lib/nav.js` (mude `pronto: true` quando lançar).
- Marca: símbolo e nome centralizados em `src/components/Logo.jsx` + título em `index.html`.

## Roadmap

1. ✅ Fundação
2. ✅ Produtos + Estoque
3. ✅ PDV / Venda rápida
4. ✅ Financeiro (caixa, contas a pagar/receber, fluxo de caixa)
5. ✅ Dashboard com KPIs reais
6. ✅ Clientes (CRM com Kanban) + fotos de produtos
7. ✅ Compras + Fornecedores (recebimento integrado)
8. ✅ Relatórios (curva ABC, exportação CSV)
9. ✅ Integrações fase 1 (webhook, WhatsApp, import/export CSV)
10. ✅ Mercado Livre (OAuth, estoque, pedidos via webhook)
11. Shopee/Amazon (mesma arquitetura, aguardando credenciais), metas, polimento para demo
