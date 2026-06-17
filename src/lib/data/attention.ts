import "server-only"

import { getRealMonthlyForUnits } from "@/lib/data/lancamentos"
import { getAvaliacoesByUnitForMonth } from "@/lib/data/avaliacoes-network"
import { previousPeriod, daysElapsedInMonth, currentPeriod } from "@/lib/period"
import { fmtBRL, fmtPct } from "@/lib/format"

/**
 * "Precisa de atenção" — transforma o dashboard de passivo (você olha) em
 * proativo (ele te avisa). Varre as lojas do escopo e levanta sinais de
 * problema usando dados que JÁ temos (sem infra de e-mail/push):
 *
 *  - faturamento: no ritmo do mês, vai fechar X% abaixo do mês anterior
 *  - cancelamento: % de cancelados acima do saudável
 *  - cmv: custo de produtos alto demais sobre o bruto
 *  - import: loja ativa que faturava e parou de importar
 *  - nota: média de avaliações baixa no mês
 *
 * As regras usam fonte CONFIÁVEL (bruto/pedidos/cancelados vêm de import; CMV
 * do manual — só dispara se lançado; nota do agregador real de avaliações).
 */

export type AttentionSeverity = "alta" | "media"
export type AttentionType =
  | "faturamento"
  | "cancelamento"
  | "cmv"
  | "import"
  | "nota"

export type AttentionItem = {
  unitId: string
  unitCode: string
  unitName: string
  type: AttentionType
  severity: AttentionSeverity
  title: string
  detail: string
}

// Limiares (ajustáveis num só lugar)
const QUEDA_MED = 0.2 // 20% de queda projetada vs mês anterior
const QUEDA_ALTA = 0.35
const CANCEL_MED = 0.07 // 7% dos pedidos
const CANCEL_ALTA = 0.12
const CMV_MED = 0.4 // 40% do bruto (mesmo limiar do alerta de margem)
const CMV_ALTA = 0.45
const NOTA_MED = 4.5
const NOTA_ALTA = 4.2
const MIN_PEDIDOS = 20 // piso pra avaliar % de cancelamento
const MIN_AVAL = 10 // piso pra avaliar nota
const MIN_BRUTO_PREV = 1000 // piso pra comparar faturamento (evita ruído)
const MIN_DIAS_PROJ = 10 // no mês corrente, só projeta faturamento após N dias

type UnitLite = { id: string; code: string; name: string; active: boolean }

export async function getAttentionItems(
  units: UnitLite[],
  year: number,
  month: number,
): Promise<AttentionItem[]> {
  const active = units.filter((u) => u.active)
  const unitIds = active.map((u) => u.id)
  if (unitIds.length === 0) return []

  const prev = previousPeriod({ year, month })
  const [thisM, prevM, avals] = await Promise.all([
    getRealMonthlyForUnits(unitIds, year, month),
    getRealMonthlyForUnits(unitIds, prev.year, prev.month),
    getAvaliacoesByUnitForMonth(year, month, unitIds),
  ])
  const avalByUnit = new Map(avals.map((a) => [a.unitId, a]))
  const daysEl = daysElapsedInMonth({ year, month })
  const totalDays = new Date(year, month, 0).getDate()
  // Mês corrente parcial: "parou de importar" não faz sentido (o dado do mês
  // ainda nem entrou) e a projeção de faturamento com poucos dias é ruidosa.
  const cur = currentPeriod()
  const isCurrent = year === cur.year && month === cur.month

  const items: AttentionItem[] = []
  for (const u of active) {
    const t = thisM.get(u.id)
    const p = prevM.get(u.id)
    const a = avalByUnit.get(u.id)
    const meta = { unitId: u.id, unitCode: u.code, unitName: u.name }

    const brutoThis = t?.faturamentoBruto ?? 0
    const brutoPrev = p?.faturamentoBruto ?? 0
    const pedidos = t?.pedidos ?? 0
    const cancelados = t?.pedidosCancelados ?? 0
    const cmv = (t?.custoProdutosCozina ?? 0) + (t?.custoProdutosLoja ?? 0)

    // 1) Parou de importar: faturava bem e este mês está zerado. Só pra meses
    //    FECHADOS — no mês corrente "sem dados ainda" é normal, não alerta.
    if (
      !isCurrent &&
      brutoThis === 0 &&
      pedidos === 0 &&
      brutoPrev >= MIN_BRUTO_PREV
    ) {
      items.push({
        ...meta,
        type: "import",
        severity: "alta",
        title: "Sem dados neste mês",
        detail: `Faturou ${fmtBRL(brutoPrev)} no mês passado e está sem nada importado agora.`,
      })
      continue // sem import, as outras regras não fazem sentido
    }

    // 2) Faturamento caindo (projeção pelo ritmo do mês). No mês corrente,
    //    só projeta depois de uns dias (5 dias projetam qualquer coisa).
    //
    // SEMPRE checa cobertura: se mês anterior tinha plataforma X com
    // faturamento mas o mês atual ainda não tem dados de X importados, a
    // comparação é injusta (ex.: maio com iFood+99+Keeta vs junho só com
    // 99 vai sempre parecer queda enorme). Só dispara quando todas as
    // plataformas que tinham dados em N-1 também têm em N.
    const coberturaCompleta =
      !t || !p
        ? false
        : (p.platforms ?? []).every((prevPlat) => {
            if ((prevPlat.bruto ?? 0) <= 0) return true // plataforma ociosa em N-1
            const thisPlat = (t.platforms ?? []).find(
              (x) => x.id === prevPlat.id,
            )
            return (thisPlat?.bruto ?? 0) > 0
          })
    const projecaoConfiavel = !isCurrent || daysEl >= MIN_DIAS_PROJ
    if (
      projecaoConfiavel &&
      coberturaCompleta &&
      brutoPrev >= MIN_BRUTO_PREV &&
      brutoThis > 0 &&
      daysEl > 0
    ) {
      const projetado = (brutoThis / daysEl) * totalDays
      const queda = (brutoPrev - projetado) / brutoPrev
      if (queda >= QUEDA_MED) {
        items.push({
          ...meta,
          type: "faturamento",
          severity: queda >= QUEDA_ALTA ? "alta" : "media",
          title: `Faturamento ${Math.round(queda * 100)}% abaixo`,
          detail: `No ritmo atual fecha ~${fmtBRL(projetado)} vs ${fmtBRL(brutoPrev)} no mês passado.`,
        })
      }
    }

    // 3) Cancelamento alto.
    if (pedidos >= MIN_PEDIDOS) {
      const taxa = cancelados / pedidos
      if (taxa >= CANCEL_MED) {
        items.push({
          ...meta,
          type: "cancelamento",
          severity: taxa >= CANCEL_ALTA ? "alta" : "media",
          title: `Cancelamento em ${fmtPct(taxa * 100)}`,
          detail: `${cancelados} de ${pedidos} pedidos cancelados no mês.`,
        })
      }
    }

    // 4) CMV alto (só quando lançado).
    if (cmv > 0 && brutoThis > 0) {
      const ratio = cmv / brutoThis
      if (ratio >= CMV_MED) {
        items.push({
          ...meta,
          type: "cmv",
          severity: ratio >= CMV_ALTA ? "alta" : "media",
          title: `CMV em ${fmtPct(ratio * 100)} do bruto`,
          detail: `Custo de produtos de ${fmtBRL(cmv)} sobre ${fmtBRL(brutoThis)} faturados.`,
        })
      }
    }

    // 5) Nota baixa.
    if (a && a.total >= MIN_AVAL && a.notaMedia > 0 && a.notaMedia < NOTA_MED) {
      items.push({
        ...meta,
        type: "nota",
        severity: a.notaMedia < NOTA_ALTA ? "alta" : "media",
        title: `Nota ${a.notaMedia.toFixed(2)}★`,
        detail: `Média de ${a.total} avaliações no mês.`,
      })
    }
  }

  // Alta antes de média; dentro disso, mais grave por tipo (import > faturamento…)
  const sevRank: Record<AttentionSeverity, number> = { alta: 0, media: 1 }
  const typeRank: Record<AttentionType, number> = {
    import: 0,
    faturamento: 1,
    cancelamento: 2,
    cmv: 3,
    nota: 4,
  }
  items.sort(
    (x, y) =>
      sevRank[x.severity] - sevRank[y.severity] ||
      typeRank[x.type] - typeRank[y.type],
  )
  return items
}
