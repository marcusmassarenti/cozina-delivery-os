/**
 * Fecha a manhã: confere se os syncs passaram e avisa por push (Vercel Cron —
 * ver vercel.json).
 *
 * ⏰ 09:30 UTC = 6h30 de Brasília. Roda DEPOIS dos quatro syncs (99 Food 5h,
 * iFood financeiro e avaliações 6h, Cardápio Web 6h05) — é o que dá sentido
 * ao "tudo importou": um push disparado no meio da rodada só contaria metade.
 *
 * Também é aqui que mora a varredura dos e-mails de "conexão ativada", que
 * antes ficava pendurada no sync de avaliações. Ela precisa ser a ÚLTIMA coisa
 * da manhã: rodando junto do financeiro, o e-mail dizia "as avaliações ainda
 * não estão entrando" pra quem tinha autorizado os dois apps certinho. Com
 * avaliações às 6h a explicação antiga deixou de valer, mas o requisito não —
 * ele só mudou de dono, e este cron é o novo fim da fila.
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

      // Varredura dos e-mails de "conectado — olha o que já entrou", das três
      // plataformas. Não derruba o cron: o push do resumo é o que não pode
      // faltar, e um erro de e-mail não pode calar o aviso da manhã.
      let conexoes: { avaliadas: number; enviados: number } | null = null
      try {
        const { varrerConexoesNovas } = await import("@/lib/email/conexao-ativada")
        conexoes = await varrerConexoesNovas()
      } catch (e) {
        console.error("varrerConexoesNovas:", e)
      }

      return Response.json({
        ok: true,
        ranAt: new Date().toISOString(),
        dia: r.dia,
        titulo: r.titulo,
        corpo: r.corpo,
        syncs: r.syncs,
        lojasComDado: r.lojasComDado,
        push: { enviados: r.enviados, destinatarios: r.destinatarios },
        conexoes,
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
