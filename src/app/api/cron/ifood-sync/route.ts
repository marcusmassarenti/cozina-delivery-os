/**
 * Cron de sincronização do iFood (Vercel Cron — ver vercel.json).
 *
 * Roda automático e sincroniza das lojas vinculadas à plataforma `ifood`
 * com `api_store_id` mapeado:
 *   - Reconciliation On Demand (mês corrente + mês anterior).
 *   - Financial Events (últimos 7 dias, D-7 a D-1).
 *
 * Throttle de 6h por (merchant, endpoint) protege contra duplo disparo.
 *
 * Segurança: a Vercel manda `Authorization: Bearer <CRON_SECRET>`. Exige que a
 * env var CRON_SECRET esteja setada e bata — senão 401.
 */
import { autoLinkAndBackfill } from "@/lib/ifood/auto-link"
import { syncIfoodAll } from "@/lib/ifood/sync"
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
  return registrarCron("ifood-sync", async () => {

  try {
    // Backfill manual: ?competences=2026-01,2026-02 força meses específicos.
    // ?force=1 ignora o throttle de 6h. Sem params = mês corrente + anterior.
    const url = new URL(req.url)
    const competences = (url.searchParams.get("competences") ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter((c) => /^\d{4}-\d{2}$/.test(c))
    const force = url.searchParams.get("force") === "1"
    // ?units=<uuid,uuid> restringe a lojas específicas.
    //
    // Existe por causa de 29/07: reprocessar junho e julho da rede inteira ao
    // mesmo tempo estourou o statement timeout do Postgres nas duas maiores
    // lojas da DG Foods. A trava nova preservou o mês, mas sem um jeito de
    // repetir SÓ aquelas duas a única saída era rodar tudo de novo — e
    // rodar tudo de novo era exatamente a causa.
    const units = (url.searchParams.get("units") ?? "")
      .split(",")
      .map((u) => u.trim())
      .filter((u) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u),
      )

    // Antes do sync: casa lojas recém-autorizadas (por CNPJ) e puxa o
    // histórico delas. Assim uma loja nova se integra sozinha — sem mexer no
    // banco na mão. Não deixa uma falha aqui derrubar o sync do dia.
    //
    // ⚠️ Com ?units, o auto-vínculo é PULADO. Ele existe pra descobrir lojas
    // novas — e descobrir custa o download de uma conciliação por loja
    // candidata. Numa chamada dirigida a duas lojas já conhecidas, isso é
    // trabalho jogado fora que come o orçamento inteiro da função: em 29/07 a
    // primeira tentativa morreu em 504 sem sequer CHEGAR no sync.
    let autoLink: Awaited<ReturnType<typeof autoLinkAndBackfill>> | null = null
    try {
      autoLink = units.length > 0 ? null : await autoLinkAndBackfill()
    } catch (e) {
      autoLink = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        vinculadas: [],
        ambiguas: [],
        merchantsVistos: 0,
        restantes: 0,
        backfill: [],
        backfillAdiado: [],
      }
    }

    const out = await syncIfoodAll({
      force,
      competences: competences.length > 0 ? competences : undefined,
      unitIds: units.length > 0 ? units : undefined,
    })
    // Relatório da rodada. Só na chamada AUTOMÁTICA: com ?units ou
    // ?competences isto é backfill na mão, e quem disparou está olhando a
    // resposta — push ali seria eco.
    const automatica = units.length === 0 && competences.length === 0
    const novas = out.results.reduce(
      (s, u) => s + u.reconciliation.reduce((t, c) => t + (c.novas ?? 0), 0),
      0,
    )
    const comErro = out.results.filter((u) =>
      // `pendente` não é erro: é extrato que o iFood ainda está gerando e que
      // a próxima rodada pega. Contar como falha faria o push gritar todo dia.
      u.reconciliation.some((c) => c.error && !c.pendente),
    ).length
    const push = automatica
      ? await tentarRelatorioSync({
          rotulo: "iFood financeiro",
          ok: true,
          lojas: out.unitsProcessed,
          erros: comErro,
          destaque: `${novas.toLocaleString("pt-BR")} lançamentos novos`,
          chave: "ifood-financeiro",
        })
      : null

    return Response.json({ ok: true, autoLink, push, ...out })
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    )
  }
  })
}
