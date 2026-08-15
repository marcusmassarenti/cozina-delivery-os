/**
 * Cron diário de sincronização das AVALIAÇÕES do iFood (Vercel Cron — ver
 * vercel.json). Roda global (todas as lojas vinculadas), puxando as avaliações
 * novas via API e as tags do detalhe. Loja não autorizada é pulada.
 *
 * ⏰ 09:00 UTC = 6h de Brasília, no mesmo horário do sync do financeiro. As
 * duas pontas da API do iFood passam a fechar junto: até 09/08 as avaliações
 * vinham uma hora depois, e quem abria o painel às 6h30 via o financeiro do
 * dia ao lado de avaliações de ontem.
 *
 * A varredura dos e-mails de "conexão ativada" saiu daqui e foi pro cron
 * `resumo-importacao` (6h30). Ela precisa rodar por último, e este cron
 * deixou de ser o último da manhã.
 *
 * Segurança: a Vercel manda `Authorization: Bearer <CRON_SECRET>`. Sem a env
 * CRON_SECRET batendo → 401.
 */
import { syncIfoodReviews } from "@/lib/ifood/review-sync"
import { registrarCron } from "@/lib/cron/registrar"
import { tentarRelatorioSync } from "@/lib/push/relatorio-sync"

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

    const push = await tentarRelatorioSync({
      rotulo: "iFood avaliações",
      ok: true,
      lojas: r.lojasProcessadas,
      erros: r.resultados.filter((u) => !u.ok).length,
      destaque: `${r.totalGravadas.toLocaleString("pt-BR")} novas`,
      chave: "ifood-avaliacoes",
    })

    return Response.json({
      ok: true,
      ranAt: new Date().toISOString(),
      push,
      ...r,
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
