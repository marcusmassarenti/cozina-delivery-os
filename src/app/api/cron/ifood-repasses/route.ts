/**
 * Repasses do iFood por ciclo, com a data real de pagamento.
 *
 * ── POR QUE CRON PRÓPRIO E NÃO DENTRO DO ifood-sync ──────────────────────
 * O `ifood-sync` já morreu de 504 uma vez (29/07/26, reprocessando junho e
 * julho da rede inteira), e o próprio arquivo dele documenta isso. São duas
 * chamadas de API por loja por fatia de 31 dias: pendurar isso lá é comprar o
 * mesmo problema de novo, com o agravante de derrubar junto o sync do
 * faturamento, que é mais importante.
 *
 * Separado, ele pode falhar sozinho sem levar nada embaixo.
 *
 * Janela padrão: mês corrente + anterior. Os ciclos fechados não mudam mais,
 * então reprocessar mais que isso é gastar chamada à toa.
 * `?desde=YYYY-MM-DD` amplia pra backfill; `?units=uuid,uuid` restringe.
 */
import { lojasIfoodParaSync } from "@/lib/ifood/lojas-sync"
import { registrarCron } from "@/lib/cron/registrar"
import { sincronizarRepassesIfood } from "@/lib/ifood/repasses"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  return registrarCron("ifood-repasses", async () => {
    const url = new URL(req.url)
    const hoje = new Date()
    const inicioPadrao = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
    const desdeParam = url.searchParams.get("desde")
    const de =
      desdeParam && /^\d{4}-\d{2}-\d{2}$/.test(desdeParam)
        ? desdeParam
        : inicioPadrao.toISOString().slice(0, 10)
    const ate = hoje.toISOString().slice(0, 10)

    const units = (url.searchParams.get("units") ?? "")
      .split(",")
      .map((u) => u.trim())
      .filter((u) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u),
      )

    const lojas = await lojasIfoodParaSync(units)
    const resultados: unknown[] = []
    let ciclos = 0
    let comErro = 0

    // Uma de cada vez: a API do iFood não gosta de rajada, e este cron não tem
    // pressa — ninguém está esperando na tela.
    for (const l of lojas) {
      try {
        const r = await sincronizarRepassesIfood(l.unitId, l.merchantId, de, ate)
        ciclos += r.ciclos
        if (r.erro) comErro++
        resultados.push({ unit: l.unitId, ...r })
      } catch (e) {
        comErro++
        resultados.push({
          unit: l.unitId,
          erro: e instanceof Error ? e.message : String(e),
        })
      }
    }

    return Response.json({
      ok: true,
      periodo: { de, ate },
      lojas: lojas.length,
      ciclos,
      comErro,
      resultados,
    })
  })
}
