import "server-only"

import { registrarCron } from "@/lib/cron/registrar"
import { enviarResumoSemanal } from "@/lib/push/resumo-semanal"
import { avisarClientesSemDado } from "@/lib/email/avisar-sem-dado"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * Segunda de manhã: push com o resumo da semana + aviso de loja sem dado.
 *
 * As duas coisas moram no MESMO cron de propósito: são a mesma cadência
 * (semanal, segunda de manhã) pro mesmo público, e separá-las criaria duas
 * rotas pra manter no lugar de uma.
 *
 * (O motivo original era outro — a conta Vercel era Hobby e limitava o número
 * de crons. Hoje é Pro e esse teto não existe mais, mas juntar segue certo
 * pelo motivo acima.)
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  return registrarCron("resumo-semanal", async () => {
    const r = await enviarResumoSemanal()

    // Nunca derruba o push: se o diagnóstico falhar, o resumo da semana sai
    // do mesmo jeito e só o aviso fica de fora.
    let avisos: Awaited<ReturnType<typeof avisarClientesSemDado>> | { erro: string }
    try {
      avisos = await avisarClientesSemDado()
    } catch (e) {
      console.error("resumo-semanal: aviso de loja sem dado falhou:", e)
      avisos = { erro: String(e) }
    }

    return Response.json({ ok: true, ranAt: new Date().toISOString(), ...r, avisos })
  })
}
