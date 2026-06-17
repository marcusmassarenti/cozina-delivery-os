/**
 * Dispara manualmente o sync iFood (mesma lógica do cron diário).
 *
 * Útil pra testar a integração sob demanda sem precisar do CRON_SECRET — só
 * usuário admin logado consegue chamar.
 *
 * NÃO substitui o cron — o cron continua rodando às 06h BRT via vercel.json.
 */
import { isSuperadmin } from "@/lib/auth/permissions"
import { syncIfoodAll } from "@/lib/ifood/sync"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST() {
  if (!(await isSuperadmin())) {
    return new Response("Unauthorized", { status: 401 })
  }
  try {
    const out = await syncIfoodAll()
    return Response.json({ ok: true, ...out })
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
