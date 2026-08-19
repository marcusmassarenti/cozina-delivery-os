import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { mesesDoBackfill } from "@/lib/backfill-regra"
import { syncNinefoodFinanceiro } from "./sync-financeiro"

/**
 * BACKFILL DO HISTÓRICO DO 99, loja a loja, uma vez por loja.
 *
 * POR QUE EXISTE: o cron do 99 cobre mês corrente + mês anterior, o que é
 * certo pro dia a dia e insuficiente pra loja que ACABOU de vincular — o
 * histórico dela nascia pela metade e ninguém tinha como pedir o resto sem
 * chamar a rota à mão com `?desde=`. Aconteceu com a Royal Poços e a Brooklin
 * em 18/08/26, ambas vinculadas com o ano inteiro faltando.
 *
 * A REGRA (Marcus, 18/08/26): "loja vinculada tem que rodar backfill imediato
 * de jan até a data corrente. isso de todas as plataformas. se 99 nao puder,
 * do limite mais antigo ate a data da conexao." O teto do 99 mora em
 * `mesesDoBackfill` — foi medido, não suposto.
 *
 * O CARIMBO É O PONTO. `historico_backfill_at` não serve só pra não repetir:
 * é ele que libera o e-mail "sua loja está conectada", que leva os números
 * dentro e sai uma vez só. Sem carimbo o e-mail sairia no meio da carga.
 *
 * Carimba SÓ se todos os meses passaram sem erro. Mês que falhou volta na
 * próxima rodada — melhor demorar um dia que fechar o histórico com buraco,
 * porque falta de dado não avisa que existe.
 */
export type Backfill99 = {
  appShopId: string
  loja: string | null
  meses: number
  linhas: number
  erros: string[]
  concluido: boolean
}

/** Teto por rodada. O cron tem 300s e cada mês é uma ida à API do 99. */
const MAX_LOJAS_POR_RODADA = 2

/**
 * BACKFILL DE UMA LOJA, NA HORA DE VINCULAR.
 *
 * ── A REGRA (Marcus, 18/08/26) ───────────────────────────────────────────
 * "Loja vinculada tem que rodar backfill IMEDIATO." Sem isto o vínculo nasce
 * mudo: em 19/08/26 a Donna Tatta e a Açaí RG Estilo foram vinculadas às 14h e
 * 16h e ficaram com ZERO linha, esperando o cron das 5h da manhã seguinte. O
 * cliente autoriza, a gente vincula, e a tela dele continua vazia por 13 horas
 * — que é exatamente quando ele abre pra conferir se funcionou.
 *
 * Não lança: o vínculo já está feito e vale mais que a carga. O que falhar
 * fica sem carimbo e o cron pega na próxima rodada.
 */
export async function backfillDeUmaLoja99(
  appShopId: string,
): Promise<Backfill99 | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("ninefood_store_links")
    .select("app_shop_id, name, created_at, historico_backfill_at")
    .eq("app_shop_id", appShopId)
    .maybeSingle()
  const l = data as {
    app_shop_id: string
    name: string | null
    created_at: string
    historico_backfill_at: string | null
  } | null
  if (!l || l.historico_backfill_at) return null
  const [r] = await rodar(admin, [l])
  return r ?? null
}

export async function backfillHistorico99(): Promise<Backfill99[]> {
  const admin = createAdminClient()

  const { data } = await admin
    .from("ninefood_store_links")
    .select("app_shop_id, name, created_at")
    .is("historico_backfill_at", null)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(MAX_LOJAS_POR_RODADA)

  return rodar(admin, (data ?? []) as Loja[])
}

type Loja = { app_shop_id: string; name: string | null; created_at: string }

/** O miolo, compartilhado pelo cron e pelo vínculo — uma regra, um lugar. */
async function rodar(
  admin: ReturnType<typeof createAdminClient>,
  pendentes: Loja[],
): Promise<Backfill99[]> {
  const out: Backfill99[] = []
  for (const l of pendentes) {
    const meses = mesesDoBackfill("99food", new Date(l.created_at))
    const r: Backfill99 = {
      appShopId: l.app_shop_id,
      loja: l.name,
      meses: meses.length,
      linhas: 0,
      erros: [],
      concluido: false,
    }

    for (const { year, month } of meses) {
      const mm = String(month).padStart(2, "0")
      const ultimoDia = new Date(year, month, 0).getDate()
      try {
        const res = await syncNinefoodFinanceiro({
          startDate: `${year}${mm}01`,
          endDate: `${year}${mm}${String(ultimoDia).padStart(2, "0")}`,
          appShopIds: [l.app_shop_id],
        })
        for (const x of res.results) {
          r.linhas += x.count
          if (x.error) r.erros.push(`${year}-${mm}: ${x.error}`)
        }
      } catch (e) {
        r.erros.push(`${year}-${mm}: ${e instanceof Error ? e.message : "erro"}`)
      }
    }

    if (r.erros.length === 0) {
      await admin
        .from("ninefood_store_links")
        .update({ historico_backfill_at: new Date().toISOString() })
        .eq("app_shop_id", l.app_shop_id)
      r.concluido = true
    }
    out.push(r)
  }

  return out
}
