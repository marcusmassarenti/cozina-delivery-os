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

    // Varredura dos e-mails de "conectado — olha o que já entrou", das TRÊS
    // plataformas, pendurada aqui de propósito.
    //
    // Este é o último cron da manhã: 99 Food às 5h, iFood às 6h, Cardápio Web
    // às 6h05, avaliações às 7h. Rodando junto do sync do financeiro (6h) o
    // e-mail diria "as avaliações ainda não estão entrando -- falta autorizar
    // o segundo app" pra quem autorizou os dois certinho, porque elas só
    // chegam uma hora depois.
    //
    // Não derruba o cron: o sync de avaliações é o que não pode faltar.
    let conexoes: { avaliadas: number; enviados: number } | null = null
    try {
      const { varrerConexoesNovas } = await import("@/lib/email/conexao-ativada")
      conexoes = await varrerConexoesNovas()
    } catch (e) {
      console.error("varrerConexoesNovas:", e)
    }

    // Expurgo dos logs de API, pendurado aqui pelo mesmo motivo da varredura:
    // é o último cron da manhã, então todo mundo já escreveu o log do dia.
    // Também não derruba o cron — perder uma faxina é irrelevante perto de
    // perder o sync das avaliações.
    let expurgo: { apagados: number; corte: string } | null = null
    try {
      const { expurgarLogsApi } = await import("@/lib/manutencao/expurgo-logs")
      expurgo = await expurgarLogsApi()
    } catch (e) {
      console.error("expurgarLogsApi:", e)
    }

    return Response.json({
      ok: true,
      ranAt: new Date().toISOString(),
      ...r,
      conexoes,
      expurgo,
    })
  } catch (e) {
    console.error("/api/cron/ifood-review-sync:", e)
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro inesperado." },
      { status: 500 },
    )
  }
  })
}
