/** Confere se o histórico do Cardápio Web devolve pedidos cancelados. */
import { fetchCw } from "../src/lib/cardapioweb/client"
import { isoComFuso } from "../src/lib/cardapioweb/pedidos"
import { createAdminClient } from "../src/lib/supabase/admin"

async function main() {
  const admin = createAdminClient()
  const { data: inst } = await admin
    .from("cardapioweb_installs")
    .select("id, ambiente, auth_mode, merchant_id")
    .eq("merchant_id", "275")
    .single()

  const chamar = async (statuses: string[] | string) => {
    const r = await fetchCw<{ orders?: { status?: string }[]; pagination?: { total_orders?: number } }>({
      installId: inst!.id,
      ambiente: inst!.ambiente,
      authMode: inst!.auth_mode,
      path: "/api/partner/v1/orders/history",
      tier: "lento",
      endpointLabel: "GET /orders/history (diag)",
      query: {
        start_date: isoComFuso(new Date("2026-04-01")),
        end_date: isoComFuso(new Date("2026-07-25"), true),
        "status[]": statuses,
        per_page: 100,
        page: 1,
      },
    })
    if (!r.ok) return `ERRO ${r.status}: ${r.error}`
    const orders = r.data?.orders ?? []
    const porStatus = new Map<string, number>()
    for (const o of orders) porStatus.set(o.status ?? "?", (porStatus.get(o.status ?? "?") ?? 0) + 1)
    return `total_orders=${r.data?.pagination?.total_orders} · nesta pág: ${[...porStatus].map(([s, n]) => `${s}=${n}`).join(", ")}`
  }

  console.log("só closed      →", await chamar("closed"))
  console.log("closed+canceled→", await chamar(["closed", "canceled"]))
}
main().catch((e) => { console.error(e); process.exit(1) })
