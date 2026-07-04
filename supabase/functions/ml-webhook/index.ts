// Recebe notificações do Mercado Livre (tópico orders_v2) e
// registra os pedidos em pedidos_marketplace.
// Deploy com: supabase functions deploy ml-webhook --no-verify-jwt
import { admin, tokenValido } from '../_shared/ml.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok')

  try {
    const notif = await req.json()
    // Ex.: { resource: "/orders/2000001234567890", topic: "orders_v2", user_id: 123456 }
    if (!notif?.resource || !String(notif.topic ?? '').startsWith('orders')) {
      return new Response('ignorado')
    }

    const db = admin()
    const { data: conta } = await db
      .from('marketplace_contas')
      .select('empresa_id')
      .eq('marketplace', 'mercadolivre')
      .eq('usuario_externo', String(notif.user_id))
      .maybeSingle()
    if (!conta) return new Response('conta desconhecida')

    const valida = await tokenValido(conta.empresa_id)
    const pedido = await (await fetch(`https://api.mercadolibre.com${notif.resource}`, {
      headers: { Authorization: `Bearer ${valida.access_token}` },
    })).json()

    if (!pedido?.id) return new Response('pedido não encontrado')

    await db.from('pedidos_marketplace').upsert({
      empresa_id: conta.empresa_id,
      marketplace: 'mercadolivre',
      pedido_externo: String(pedido.id),
      total: pedido.total_amount ?? null,
      comprador: pedido.buyer?.nickname ?? null,
      dados: {
        status: pedido.status,
        itens: (pedido.order_items ?? []).map((i: any) => ({
          item: i.item?.id,
          titulo: i.item?.title,
          quantidade: i.quantity,
          preco: i.unit_price,
        })),
        data: pedido.date_created,
      },
    }, { onConflict: 'empresa_id,marketplace,pedido_externo' })

    return new Response('ok')
  } catch {
    // Sempre 200: o ML reenvia sozinho quando falha de verdade
    return new Response('erro tratado')
  }
})
