/**
 * Cron diário de sincronização das AVALIAÇÕES do iFood (Vercel Cron — ver
 * vercel.json). Roda global (todas as lojas vinculadas), puxando as avaliações
 * novas via API e as tags do detalhe. Loja não autorizada é pulada.
 *
 * ⏰ 08:00 UTC = 5h de Brasília, entre o financeiro (4h) e o 99 Food (6h). As
 * três rotinas do iFood + 99 fecham antes das 6h30, que é quando o resumo da
 * manhã confere tudo e avisa.
 *
 * Este cron DEIXOU DE SER o último da manhã, e duas tarefas que moravam aqui
 * só por causa disso foram junto pro `resumo-importacao` (6h30): a varredura
 * dos e-mails de "conexão ativada" e a faxina dos logs de API. As duas
 * dependem de todo mundo já ter rodado — a regra não mudou, mudou o dono.
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

  /**
   * `?units=<uuid,uuid>` limita a lojas específicas.
   *
   * Existe pela regra do backfill imediato (Marcus, 18/08/26): loja que acabou
   * de vincular não pode esperar a virada do dia pra ter avaliação. O cron
   * diário continua rodando sem parâmetro, pra rede inteira.
   */
  const p = new URL(req.url).searchParams.get("units")
  const unitIds = p ? p.split(",").map((x) => x.trim()).filter(Boolean) : null

  // Envelope de registro: deixa rastro em cron_runs pra o relatório
  // diário saber a diferença entre "rodou e não achou nada" e "não rodou".
  return registrarCron("ifood-review-sync", async () => {

  try {
    const r = await syncIfoodReviews(unitIds)

    // Horário de funcionamento das lojas. Fica aqui porque é dado do iFood e
    // muda raramente — uma vez por dia sobra, e não depende de ordem nenhuma.
    // (O motivo antigo era o limite de crons do plano Hobby; a conta é Pro.)
    let horarios: { lojas: number; turnos: number } | null = null
    try {
      const { syncIfoodHorarios } = await import("@/lib/ifood/horarios")
      const r2 = await syncIfoodHorarios(null)
      horarios = { lojas: r2.lojas, turnos: r2.turnos }
    } catch (e) {
      console.error("syncIfoodHorarios:", e)
    }

    // Aviso de último dia pra responder avaliação. Fica DEPOIS do sync de
    // propósito: é ele que acabou de atualizar o status, e avisar antes usaria
    // a foto de ontem — anunciando como pendente o que a loja já respondeu
    // pelo portal. Também não derruba o cron.
    let prazoAvaliacoes: { avisados: number; avaliacoes: number } | null = null
    try {
      const { avisarAvaliacoesNoPrazoFinal } = await import(
        "@/lib/push/avaliacoes-prazo"
      )
      const av = await avisarAvaliacoesNoPrazoFinal()
      prazoAvaliacoes = {
        avisados: av.avisados.length,
        avaliacoes: av.avisados.reduce((a, b) => a + b.avaliacoes, 0),
      }
    } catch (e) {
      console.error("avisarAvaliacoesNoPrazoFinal:", e)
    }

    // Relatório da rodada. Só na varredura COMPLETA: com ?units isto é
    // backfill de uma loja recém-vinculada, e quem disparou está olhando a
    // resposta — push ali seria eco.
    const push = unitIds
      ? null
      : await tentarRelatorioSync({
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
      ...r,
      push,
      prazoAvaliacoes,
      horarios,
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
