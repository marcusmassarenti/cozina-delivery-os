/**
 * Régua de e-mails do ciclo de vida do cliente — uma passada por dia.
 *
 * Sem RESEND_API_KEY o cron roda e registra "pendente" em vez de enviar, então
 * dá pra ver a régua funcionando antes de existir chave. Não falha por isso.
 *
 * A trava contra e-mail repetido é o índice único de email_enviados, não a
 * data — rodar duas vezes no mesmo dia não manda nada duas vezes.
 */
import { rodarReguaEmail } from "@/lib/data/regua-email"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const r = await rodarReguaEmail()
  return Response.json({
    ok: true,
    ranAt: new Date().toISOString(),
    temChave: Boolean(process.env.RESEND_API_KEY),
    ...r,
  })
}
