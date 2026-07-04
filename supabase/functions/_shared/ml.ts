// Helpers compartilhados das funções do Mercado Livre
import { createClient } from 'npm:@supabase/supabase-js@2'

export const admin = () =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

// Devolve um access_token válido para a empresa, renovando se expirou.
export async function tokenValido(empresaId: string) {
  const db = admin()
  const { data: conta } = await db
    .from('marketplace_contas')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('marketplace', 'mercadolivre')
    .maybeSingle()

  if (!conta) throw new Error('Mercado Livre não conectado')

  const expira = conta.expira_em ? new Date(conta.expira_em).getTime() : 0
  if (expira - Date.now() > 60_000) return conta // ainda válido

  // Renova com o refresh_token
  const resp = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: Deno.env.get('ML_CLIENT_ID')!,
      client_secret: Deno.env.get('ML_CLIENT_SECRET')!,
      refresh_token: conta.refresh_token,
    }),
  })
  if (!resp.ok) throw new Error('Falha ao renovar token do Mercado Livre')
  const tk = await resp.json()

  const { data: atualizada } = await db
    .from('marketplace_contas')
    .update({
      access_token: tk.access_token,
      refresh_token: tk.refresh_token ?? conta.refresh_token,
      expira_em: new Date(Date.now() + tk.expires_in * 1000).toISOString(),
    })
    .eq('id', conta.id)
    .select()
    .single()

  return atualizada!
}

// Identifica a empresa do usuário logado a partir do JWT da requisição.
export async function empresaDoUsuario(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  const { data: perfil } = await admin()
    .from('profiles')
    .select('empresa_id, role, ativo')
    .eq('id', user.id)
    .single()

  if (!perfil?.empresa_id || !perfil.ativo) throw new Error('Sem empresa')
  return { empresaId: perfil.empresa_id as string, userId: user.id }
}
