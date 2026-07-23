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
import { autoLinkAndBackfill } from "@/lib/ifood/auto-link"
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
    // Backfill manual: ?competences=2026-01,2026-02 força meses específicos.
    // ?force=1 ignora o throttle de 6h. Sem params = mês corrente + anterior.
    const url = new URL(req.url)
    const competences = (url.searchParams.get("competences") ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter((c) => /^\d{4}-\d{2}$/.test(c))
    const force = url.searchParams.get("force") === "1"

    // Antes do sync: casa lojas recém-autorizadas (por CNPJ) e puxa o
    // histórico delas. Assim uma loja nova se integra sozinha — sem mexer no
    // banco na mão. Não deixa uma falha aqui derrubar o sync do dia.
    let autoLink: Awaited<ReturnType<typeof autoLinkAndBackfill>> | null = null
    try {
      autoLink = await autoLinkAndBackfill()
    } catch (e) {
      autoLink = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        vinculadas: [],
        ambiguas: [],
        merchantsVistos: 0,
        backfill: [],
        backfillAdiado: [],
      }
    }

    const out = await syncIfoodAll({
      force,
      competences: competences.length > 0 ? competences : undefined,
    })
    return Response.json({ ok: true, autoLink, ...out })
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
