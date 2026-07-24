/**
 * Dispara manualmente o sync de AVALIAÇÕES do iFood — escopado ao tenant de
 * quem clicou (mesma disciplina do sync financeiro: nunca roda a rede toda a
 * partir de um clique de usuário; o cron é que roda global).
 *
 * Guardas:
 *  1. login com acesso ao dashboard
 *  2. unidades restritas às do usuário (getAccessibleUnitIds)
 *
 * Nota: não exige `api_sync_enabled` (essa flag é do financeiro). Avaliações
 * dependem só do app "review" configurado + a loja autorizada no portal — loja
 * sem autorização volta "pular" com motivo, sem quebrar.
 */
import { getAccessibleUnitIds, userCan } from "@/lib/auth/permissions"
import { syncIfoodReviews } from "@/lib/ifood/review-sync"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST() {
  if (!(await userCan("dashboard", "view"))) {
    return new Response("Unauthorized", { status: 401 })
  }

  const unitIds = await getAccessibleUnitIds()
  if (unitIds !== null && unitIds.length === 0) {
    return Response.json({
      ok: true,
      ranAt: new Date().toISOString(),
      lojasProcessadas: 0,
      totalGravadas: 0,
      resultados: [],
    })
  }

  try {
    const r = await syncIfoodReviews(unitIds)
    return Response.json({ ok: true, ranAt: new Date().toISOString(), ...r })
  } catch (e) {
    console.error("/api/integracao/ifood-review-sync-run:", e)
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro inesperado." },
      { status: 500 },
    )
  }
}
