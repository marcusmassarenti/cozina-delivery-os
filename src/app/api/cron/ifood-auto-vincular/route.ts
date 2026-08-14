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
 * esperando, sai antes de falar com o iFood.
 *
 * ⏰ Roda de 15 em 15 minutos — a expressão está no vercel.json, e NÃO pode
 * ser copiada pra cá: ela contém a sequência que FECHA este comentário, e o
 * arquivo inteiro vira código inválido (foi o que derrubou o build em
 * 09/08/26).
 *
 * Quem aprova no Portal do Parceiro espera minutos, não o dia seguinte. Quem
 * não quer nem isso usa o botão "Já autorizei — conferir e vincular" na tela
 * de merchants, que faz o mesmo na hora.
 *
 * ⚠️ HISTÓRICO, não regra atual: enquanto a conta Vercel era HOBBY, cron mais
 * frequente que diário FALHAVA O DEPLOY — não era aviso, o build quebrava, e
 * foi assim que 17 commits ficaram travados em 27/jul. Hoje a conta comporta
 * os 15 minutos. Guardado aqui só pra ninguém "consertar" a frequência de
 * volta pra diária achando que o limite ainda vale.
 */
import { autoLinkIfoodMerchants } from "@/lib/ifood/auto-link"
import { createAdminClient } from "@/lib/supabase/admin"
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
  return registrarCron("ifood-auto-vincular", async () => {

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

  // Nada esperando vínculo = nada a fazer. O histórico das lojas já
  // vinculadas tem cron próprio (/api/cron/ifood-backfill) desde 14/08/26 —
  // enquanto os dois dividiam esta janela, o backfill ficava sem tempo e a
  // fila congelava sem ninguém perceber.
  if (unitIds.length === 0) {
    return Response.json({ ok: true, esperando: 0, vinculadas: [] })
  }

  /**
   * Só vincular. O histórico saiu daqui em 14/08/26.
   *
   * Os dois trabalhos não cabiam na mesma janela de 240s: o auto-vínculo pode
   * levar 150s (cada CNPJ desconhecido custa o download de uma conciliação) e
   * o backfill reserva 180s por loja. Bastava o primeiro passar de 60s pra que
   * TODAS as lojas caíssem em "adiado" — a fila congelou em 8 por mais de duas
   * horas com todas as rodadas terminando `ok: true`.
   *
   * Agora o histórico tem cron próprio: /api/cron/ifood-backfill, de 5 em 5
   * minutos, com a janela inteira pra ele.
   */
  const r = await autoLinkIfoodMerchants(unitIds, { deadlineMs: 200_000 })

  return Response.json({
    ok: r.ok,
    ranAt: new Date().toISOString(),
    esperando: unitIds.length,
    vinculadas: r.vinculadas.map((v) => `${v.unitCode} ${v.unitName}`),
    naoResolvidas: r.ambiguas.map((a) => `${a.unitName}: ${a.motivo}`),
    restantes: r.restantes,
    error: r.error,
  })
  })
}
