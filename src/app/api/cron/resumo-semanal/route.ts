import "server-only"

import { registrarCron } from "@/lib/cron/registrar"
import { enviarResumoSemanal } from "@/lib/push/resumo-semanal"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

/** Resumo da semana por push. Segunda de manhã, semana anterior fechada. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  return registrarCron("resumo-semanal", async () => {
    const r = await enviarResumoSemanal()
    return Response.json({ ok: true, ranAt: new Date().toISOString(), ...r })
  })
}
