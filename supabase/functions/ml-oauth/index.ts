// Callback do OAuth do Mercado Livre.
// Deploy com: supabase functions deploy ml-oauth --no-verify-jwt
import { admin } from '../_shared/ml.ts'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const empresaId = url.searchParams.get('state') // enviado pelo front
  const appUrl = Deno.env.get('APP_URL') ?? '/'

  const voltar = (q: string) =>
    Response.redirect(`${appUrl}/integracoes?ml=${q}`, 302)

  if (!code || !empresaId) return voltar('erro')

  try {
    // Troca o code por tokens
    const resp = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: Deno.env.get('ML_CLIENT_ID')!,
        client_secret: Deno.env.get('ML_CLIENT_SECRET')!,
        code,
        redirect_uri: `${Deno.env.get('SUPABASE_URL')}/functions/v1/ml-oauth`,
      }),
    })
    if (!resp.ok) return voltar('erro')
    const tk = await resp.json()

    // Dados da conta ML
    const me = await (await fetch('https://api.mercadolibre.com/users/me', {
      headers: { Authorization: `Bearer ${tk.access_token}` },
    })).json()

    await admin().from('marketplace_contas').upsert({
      empresa_id: empresaId,
      marketplace: 'mercadolivre',
      usuario_externo: String(me.id),
      apelido: me.nickname ?? null,
      access_token: tk.access_token,
      refresh_token: tk.refresh_token,
      expira_em: new Date(Date.now() + tk.expires_in * 1000).toISOString(),
    }, { onConflict: 'empresa_id,marketplace' })

    return voltar('ok')
  } catch {
    return voltar('erro')
  }
})
