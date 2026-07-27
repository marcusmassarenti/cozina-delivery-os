/**
 * Cron curto: fecha sozinho a conexão das lojas que o cliente já aprovou.
 *
 * Fluxo que ele completa: o cliente aprova no Portal do Parceiro → clica
 * "Já aprovei no iFood" (carimba `cliente_confirmou_at`) → e aqui a loja é
 * casada por CNPJ, vinculada e ativada. Do lado do cliente o card de "falta
 * aprovar" some e vira "sua loja foi conectada! 🎉".
 *
 * Por que não roda no clique do cliente: depois da aprovação, o merchant leva
 * alguns minutos pra aparecer no nosso GET /merchants. No instante do clique
 * ele quase nunca está lá — precisa de alguém que tente de novo. E descobrir
 * o CNPJ custa o download de uma conciliação, o que passa longe do tempo que
 * um clique de usuário pode esperar.
 *
 * Barato quando não há nada: a primeira query é um count; sem loja confirmada
 * esperando, sai antes de falar com o iFood. Roda a cada 15 min (vercel.json).
 */
import { autoLinkIfoodMerchants } from "@/lib/ifood/auto-link"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const admin = createAdminClient()

  // Só as que o cliente CONFIRMOU: são as únicas em que faz sentido procurar
  // o merchant agora. As demais seguem no cron diário completo.
  const { data: esperando } = await admin
    .from("ifood_activation_requests")
    .select("unit_id")
    .eq("status", "solicitada")
    .not("cliente_confirmou_at", "is", null)

  const unitIds = ((esperando ?? []) as { unit_id: string | null }[])
    .map((r) => r.unit_id)
    .filter((v): v is string => Boolean(v))

  if (unitIds.length === 0) {
    return Response.json({ ok: true, esperando: 0, vinculadas: [] })
  }

  // Teto abaixo do maxDuration pra sobrar margem de resposta. O que não couber
  // fica pra próxima rodada — e o CNPJ descoberto agora deixa a próxima rápida.
  const r = await autoLinkIfoodMerchants(unitIds, { deadlineMs: 240_000 })

  return Response.json({
    ok: r.ok,
    ranAt: new Date().toISOString(),
    esperando: unitIds.length,
    vinculadas: r.vinculadas.map((v) => `${v.unitCode} ${v.unitName}`),
    naoResolvidas: r.ambiguas.map((a) => `${a.unitName}: ${a.motivo}`),
    restantes: r.restantes,
    error: r.error,
  })
}
