/**
 * Cron diário de sincronização das AVALIAÇÕES do iFood (Vercel Cron — ver
 * vercel.json). Roda global (todas as lojas vinculadas), puxando as avaliações
 * novas via API e as tags do detalhe. Loja não autorizada é pulada.
 *
 * Segurança: a Vercel manda `Authorization: Bearer <CRON_SECRET>`. Sem a env
 * CRON_SECRET batendo → 401.
 */
import { syncIfoodReviews } from "@/lib/ifood/review-sync"
import { registrarCron } from "@/lib/cron/registrar"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  // Envelope de registro: deixa rastro em cron_runs pra o relatório
  // diário saber a diferença entre "rodou e não achou nada" e "não rodou".
  return registrarCron("ifood-review-sync", async () => {

  try {
    const r = await syncIfoodReviews(null)
    return Response.json({ ok: true, ranAt: new Date().toISOString(), ...r })
  } catch (e) {
    console.error("/api/cron/ifood-review-sync:", e)
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro inesperado." },
      { status: 500 },
    )
  }
  })
}
