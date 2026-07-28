/**
 * Emite as faturas do mês, todo dia 1º.
 *
 * Roda diariamente de propósito, não só no dia 1: se a Vercel falhar naquele
 * dia específico, o mês inteiro ficaria sem cobrança e ninguém perceberia até
 * o fechamento. Como a emissão é idempotente pelo índice único
 * (holding_id, competencia), rodar todo dia só recupera o que faltou — nos
 * demais dias ele acha tudo "já emitida" e sai.
 */
import { sincronizarTodasAssinaturas } from "@/lib/data/assinatura-sync"
import { emitirFaturasDoMes } from "@/lib/data/faturas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const r = await emitirFaturasDoMes()

  // Rede de segurança do valor da assinatura: os gatilhos em cadastro de loja
  // são best-effort (não podem derrubar o salvamento), então algum pode ter
  // falhado calado. Aqui a gente reconcilia todo mundo — e só reporta quem
  // realmente mudou, pra o log não virar ruído.
  const assinaturas = await sincronizarTodasAssinaturas()

  return Response.json({
    ok: true,
    ranAt: new Date().toISOString(),
    emitidas: r.emitidas,
    puladas: r.puladas,
    assinaturasAjustadas: assinaturas,
  })
}
