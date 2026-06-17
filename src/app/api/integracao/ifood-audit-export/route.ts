/**
 * Export JSON da auditoria iFood — últimas 50 chamadas em `ifood_api_logs`.
 *
 * Pra reunião de homologação: o auditor anexa esse JSON no processo como
 * evidência das chamadas feitas. Inclui:
 *   - request: endpoint, method, url, headers (Authorization mascarado), body
 *   - response: status, body (até 50k chars), size, duration_ms, retry_count
 *   - meta: merchant_id, homologation_header, error_message, created_at
 *
 * Segurança: requer usuário admin (RLS via createServerClient).
 */
import { isSuperadmin } from "@/lib/auth/permissions"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  if (!(await isSuperadmin())) {
    return new Response("Unauthorized", { status: 401 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("ifood_api_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    source: "Cozina Delivery OS — Homologação iFood Merchant API",
    count: data?.length ?? 0,
    logs: data ?? [],
  }
  const filename = `ifood-audit-${new Date().toISOString().slice(0, 10)}.json`

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
