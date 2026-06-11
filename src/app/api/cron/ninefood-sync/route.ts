/**
 * Cron de sincronização do 99 Food (Vercel Cron — ver vercel.json).
 *
 * Roda automático e sincroniza, das lojas vinculadas:
 *   - Financeiro do MÊS ATUAL + MÊS ANTERIOR (garante captura antes da janela
 *     de 3 meses da API do 99 fechar — depois de gravado, fica pra sempre).
 *   - Cardápio (snapshot atual).
 *
 * Segurança: a Vercel manda `Authorization: Bearer <CRON_SECRET>`. Exige que a
 * env var CRON_SECRET esteja setada e bata — senão 401.
 */
import { syncNinefoodFinanceiro } from "@/lib/ninefood/sync-financeiro"
import { syncNinefoodCardapio } from "@/lib/ninefood/sync-cardapio"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  // mês atual + anterior (app roda em TZ America/Sao_Paulo)
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const periodos = [
    { y: now.getFullYear(), m: now.getMonth() + 1 },
    { y: prev.getFullYear(), m: prev.getMonth() + 1 },
  ]

  const financeiro: {
    competencia: string
    lojas: number
    erros: number
    liquido: number
  }[] = []
  for (const { y, m } of periodos) {
    const mm = String(m).padStart(2, "0")
    const lastDay = new Date(y, m, 0).getDate()
    const r = await syncNinefoodFinanceiro({
      startDate: `${y}${mm}01`,
      endDate: `${y}${mm}${String(lastDay).padStart(2, "0")}`,
    })
    financeiro.push({
      competencia: `${y}-${mm}`,
      lojas: r.results.length,
      erros: r.results.filter((x) => x.error).length,
      liquido: r.results.reduce((s, x) => s + x.liquido, 0),
    })
  }

  const card = await syncNinefoodCardapio()

  return Response.json({
    ok: true,
    ranAt: new Date().toISOString(),
    financeiro,
    cardapio: {
      lojas: card.results.length,
      erros: card.results.filter((x) => x.error).length,
    },
  })
}
