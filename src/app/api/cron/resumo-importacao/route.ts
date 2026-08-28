/**
 * Fecha a manhã: confere em `cron_runs` se os syncs passaram (Vercel Cron —
 * ver vercel.json).
 *
 * ⏰ 09:30 UTC = 6h30 de Brasília. Roda DEPOIS dos quatro syncs (iFood
 * financeiro 4h, avaliações 5h, 99 Food 6h, Cardápio Web 6h05).
 *
 * Só manda push quando algo falhou ou não rodou. O "importou" de cada rotina
 * já chega na hora dela, pelo próprio cron; o que falta é o aviso que NENHUM
 * deles consegue dar, porque rotina que não dispara não notifica — a ausência
 * de push se parece com tudo certo. É esse silêncio que aqui vira alerta.
 *
 * Também herdou duas tarefas que moravam no sync de avaliações enquanto ELE
 * era o último cron da manhã. Com as avaliações às 5h, quem fecha a fila é
 * este cron — então as duas mudaram de dono, não de regra.
 *
 * Segurança: a Vercel manda `Authorization: Bearer <CRON_SECRET>`. Sem a env
 * CRON_SECRET batendo → 401.
 */
import { enviarResumoImportacao } from "@/lib/push/resumo-importacao"
import { registrarCron } from "@/lib/cron/registrar"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  return registrarCron("resumo-importacao", async () => {
    try {
      const r = await enviarResumoImportacao()

      // Varredura dos e-mails de "conectado — olha o que já entrou". Precisa
      // ser a ÚLTIMA coisa da manhã: rodando antes do fim dos syncs, o e-mail
      // diz "ainda não está entrando" pra quem conectou tudo certo. O 99 Food
      // faz a própria varredura no fim do cron dele; esta pega o resto.
      let conexoes: { avaliadas: number; enviados: number } | null = null
      try {
        const { varrerConexoesNovas } = await import("@/lib/email/conexao-ativada")
        conexoes = await varrerConexoesNovas()
      } catch (e) {
        console.error("varrerConexoesNovas:", e)
      }

      // Faxina dos logs de API, pelo mesmo motivo: todo mundo já escreveu o
      // log do dia. Não derruba o cron — perder uma faxina é irrelevante
      // perto de perder o aviso da manhã.
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
        dia: r.dia,
        silencioso: r.silencioso,
        titulo: r.titulo,
        corpo: r.corpo,
        syncs: r.syncs,
        lojasComDado: r.lojasComDado,
        push: { enviados: r.enviados, destinatarios: r.destinatarios },
        conexoes,
        expurgo,
      })
    } catch (e) {
      console.error("/api/cron/resumo-importacao:", e)
      return Response.json(
        { ok: false, error: e instanceof Error ? e.message : "Erro inesperado." },
        { status: 500 },
      )
    }
  })
}
