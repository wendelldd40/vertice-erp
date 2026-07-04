// Ações do Mercado Livre chamadas pelo app (JWT verificado):
//   { action: "itens" }         → lista anúncios ativos da conta
//   { action: "sync_estoque" }  → envia saldo do Vértice para os anúncios vinculados
// Deploy com: supabase functions deploy ml
import { admin, tokenValido, empresaDoUsuario, json, cors } from '../_shared/ml.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { empresaId } = await empresaDoUsuario(req)
    const { action } = await req.json()
    const conta = await tokenValido(empresaId)
    const auth = { Authorization: `Bearer ${conta.access_token}` }

    if (action === 'itens') {
      const busca = await (await fetch(
        `https://api.mercadolibre.com/users/${conta.usuario_externo}/items/search?status=active&limit=50`,
        { headers: auth },
      )).json()
      const ids: string[] = busca.results ?? []
      if (!ids.length) return json({ itens: [] })

      const detalhes = await (await fetch(
        `https://api.mercadolibre.com/items?ids=${ids.join(',')}&attributes=id,title,available_quantity,price`,
        { headers: auth },
      )).json()

      const itens = (detalhes ?? [])
        .map((d: any) => d.body)
        .filter(Boolean)
        .map((b: any) => ({
          id: b.id, titulo: b.title,
          estoque: b.available_quantity, preco: b.price,
        }))
      return json({ itens })
    }

    if (action === 'sync_estoque') {
      const db = admin()
      const { data: vinculos } = await db
        .from('produto_vinculos')
        .select('item_externo, produto_id')
        .eq('empresa_id', empresaId)
        .eq('marketplace', 'mercadolivre')

      if (!vinculos?.length) return json({ atualizados: 0, erros: 0, detalhe: 'Nenhum produto vinculado' })

      const { data: saldos } = await db
        .from('estoque_saldos')
        .select('produto_id, quantidade')
        .eq('empresa_id', empresaId)

      const porProduto = new Map<string, number>()
      for (const s of saldos ?? []) {
        porProduto.set(s.produto_id, (porProduto.get(s.produto_id) ?? 0) + Number(s.quantidade))
      }

      let atualizados = 0, erros = 0
      for (const v of vinculos) {
        const qtd = Math.max(Math.floor(porProduto.get(v.produto_id) ?? 0), 0)
        const resp = await fetch(`https://api.mercadolibre.com/items/${v.item_externo}`, {
          method: 'PUT',
          headers: { ...auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({ available_quantity: qtd }),
        })
        if (resp.ok) atualizados++
        else erros++
      }
      return json({ atualizados, erros })
    }

    return json({ erro: 'Ação desconhecida' }, 400)
  } catch (e) {
    return json({ erro: (e as Error).message }, 400)
  }
})
