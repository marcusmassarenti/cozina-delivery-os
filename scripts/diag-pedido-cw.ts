/**
 * Diagnóstico pontual: busca um pedido do Cardápio Web e imprime só os
 * campos numéricos, pra achar qual valor estourou a coluna do banco.
 *
 * Rodar:
 *   ORDER_ID=48674 npx tsx --tsconfig scripts/tsconfig.teste.json \
 *     --env-file=.env.local scripts/diag-pedido-cw.ts
 */
import { fetchCw } from "../src/lib/cardapioweb/client"
import { createAdminClient } from "../src/lib/supabase/admin"

const ORDER_ID = process.env.ORDER_ID ?? "48674"

async function main() {
  const admin = createAdminClient()

  const { data: pedido } = await admin
    .from("cardapioweb_pedidos")
    .select("install_id")
    .eq("order_id", ORDER_ID)
    .maybeSingle()

  if (!pedido) {
    console.log(`Pedido ${ORDER_ID} não está no banco.`)
    return
  }

  const { data: install } = await admin
    .from("cardapioweb_installs")
    .select("id, ambiente, auth_mode")
    .eq("id", pedido.install_id)
    .single()

  const r = await fetchCw<Record<string, unknown>>({
    installId: install!.id,
    ambiente: install!.ambiente,
    authMode: install!.auth_mode,
    path: `/api/partner/v1/orders/${ORDER_ID}`,
    endpointLabel: "GET /orders/{id} (diag)",
  })

  if (!r.ok || !r.data) {
    console.log(`API respondeu ${r.status}: ${r.error}`)
    return
  }

  // Varre o JSON inteiro e lista todo número com magnitude suspeita.
  const suspeitos: string[] = []
  function varrer(obj: unknown, caminho: string) {
    if (typeof obj === "number") {
      if (Math.abs(obj) >= 1_000_000) {
        suspeitos.push(`${caminho} = ${obj}`)
      }
      return
    }
    if (Array.isArray(obj)) {
      obj.forEach((v, i) => varrer(v, `${caminho}[${i}]`))
      return
    }
    if (obj && typeof obj === "object") {
      for (const [k, v] of Object.entries(obj)) varrer(v, `${caminho}.${k}`)
    }
  }
  varrer(r.data, "pedido")

  console.log(`\n=== Pedido ${ORDER_ID} ===`)
  console.log(`total: ${JSON.stringify(r.data.total)}`)
  console.log(`itens: ${(r.data.items as unknown[] | undefined)?.length ?? 0}`)
  console.log(`\nNúmeros >= 1.000.000 (candidatos ao overflow):`)
  console.log(suspeitos.length ? suspeitos.join("\n") : "  nenhum")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
