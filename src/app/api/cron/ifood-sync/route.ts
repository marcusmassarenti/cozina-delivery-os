/**
 * Cron de sincronização do iFood (Vercel Cron — ver vercel.json).
 *
 * Roda automático e sincroniza das lojas vinculadas à plataforma `ifood`
 * com `api_store_id` mapeado:
 *   - Reconciliation On Demand (mês corrente + mês anterior).
 *   - Financial Events (últimos 7 dias, D-7 a D-1).
 *
 * Throttle de 6h por (merchant, endpoint) protege contra duplo disparo.
 *
 * Segurança: a Vercel manda `Authorization: Bearer <CRON_SECRET>`. Exige que a
 * env var CRON_SECRET esteja setada e bata — senão 401.
 */
import { syncIfoodAll } from "@/lib/ifood/sync"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  try {
    const out = await syncIfoodAll()
    return Response.json({ ok: true, ...out })
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    )
  }
}
