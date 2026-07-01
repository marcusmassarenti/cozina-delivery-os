/**
 * Saúde da importação: cada relatório tem uma CADÊNCIA (diário/semanal/mensal)
 * e é avaliado pelo que faz sentido pra ela:
 *
 *  - MENSAL por loja (iFood Conciliação e Pedidos): "completo" quando todas as
 *    lojas DAQUELA plataforma têm o mês. Mostra quais faltam (só lojas iFood —
 *    loja fora da plataforma não conta).
 *  - DIÁRIO / SEMANAL (99, Keeta, avaliações, cardápio): frescor — até que dia
 *    tem dado no mês. "Em dia" = dado até ontem (D-1, diário) / últimos 7 dias
 *    (semanal). Senão, "atrasado N dias".
 *
 * Performance: os mensais por loja vêm do log platform_imports (pequeno, com
 * ref_year/ref_month e unambíguo pra iFood). Os de rede vêm de um
 * `order by data desc limit 1` (instantâneo) — sem paginar tabela gigante.
 */

import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  loadCoverageContext,
  shouldExpectDataForMonth,
} from "@/lib/data/coverage-helper"
import { getUnits } from "@/lib/data/units"
import type { PlatformId } from "@/components/platform-logo"

export type Cadencia = "diario" | "semanal" | "mensal"
export type ChecklistStatus = "ok" | "parcial" | "atrasado" | "falta"

type ReportDef = {
  platform: PlatformId
  key: string
  label: string
  cadencia: Cadencia
  /** Mensal por loja (iFood): usa platform_imports + filtra lojas da plataforma. */
  perStore: boolean
  /** report_type no platform_imports (só perStore iFood). */
  importReportType?: string
  /** Tabela + coluna de data pro frescor (relatórios de rede). */
  table?: string
  dateCol?: string
}

const REPORTS: ReportDef[] = [
  { platform: "ifood", key: "conciliacao", label: "Conciliação / Repasse", cadencia: "mensal", perStore: true, importReportType: "financeiro" },
  { platform: "ifood", key: "pedidos", label: "Relatório de pedidos (VR)", cadencia: "mensal", perStore: true, importReportType: "pedidos" },
  { platform: "ifood", key: "avaliacoes", label: "Avaliações", cadencia: "semanal", perStore: false, table: "ifood_avaliacoes", dateCol: "data_avaliacao" },
  { platform: "ifood", key: "cardapio", label: "Cardápio", cadencia: "semanal", perStore: false, table: "ifood_cardapio_periodo", dateCol: "period_end" },
  { platform: "99food", key: "loja", label: "Dados da loja", cadencia: "diario", perStore: false, table: "ninefood_daily_loja", dateCol: "data" },
  { platform: "99food", key: "item", label: "Dados do item", cadencia: "diario", perStore: false, table: "ninefood_daily_item", dateCol: "data" },
  { platform: "99food", key: "pedido", label: "Dados do pedido", cadencia: "diario", perStore: false, table: "ninefood_pedidos", dateCol: "data" },
  { platform: "keeta", key: "restaurante", label: "Dados do restaurante", cadencia: "diario", perStore: false, table: "keeta_daily_loja", dateCol: "data" },
  { platform: "keeta", key: "pedido", label: "Dados do pedido", cadencia: "diario", perStore: false, table: "keeta_pedidos", dateCol: "data" },
  { platform: "keeta", key: "pedido_recente", label: "Pedidos recentes", cadencia: "diario", perStore: false, table: "keeta_pedidos_recentes", dateCol: "data" },
  { platform: "keeta", key: "promocao", label: "Dados da promoção", cadencia: "diario", perStore: false, table: "keeta_promocoes", dateCol: "data" },
  { platform: "keeta", key: "item", label: "Dados do item", cadencia: "diario", perStore: false, table: "keeta_daily_item", dateCol: "data" },
]

export type ReportStatus = {
  platform: PlatformId
  key: string
  label: string
  cadencia: Cadencia
  perStore: boolean
  status: ChecklistStatus
  // Mensal por loja:
  unitsWithData: number
  totalLinked: number
  missingCodes: string[]
  // Frescor (rede):
  lastDate: string | null // "YYYY-MM-DD"
  lagDays: number | null // dias atrás do alvo (0 = em dia); null = sem dado
}

export type ImportChecklist = {
  year: number
  month: number
  totalUnits: number
  reports: ReportStatus[]
  /** Resumo pro cabeçalho. */
  okCount: number
  atrasadoCount: number
  faltaCount: number
}

const pad2 = (n: number) => String(n).padStart(2, "0")

function parseYmd(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d)
}

export async function getImportChecklistForMonth(
  year: number,
  month: number,
): Promise<ImportChecklist> {
  const admin = createAdminClient()
  const units = (await getUnits()).filter((u) => u.active)
  const idToCode = new Map(units.map((u) => [u.id, u.code]))

  const startIso = `${year}-${pad2(month)}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const endExcl = `${nextYear}-${pad2(nextMonth)}-01`
  const monthEndDay = new Date(year, month, 0)

  // Alvo de frescor: menor entre fim do mês e ontem (D-1).
  const now = new Date()
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  const target = yesterday < monthEndDay ? yesterday : monthEndDay

  // Lojas vinculadas por plataforma (pros mensais por loja). Aplica o
  // helper de cobertura: lojas pausadas/encerradas no mês alvo NÃO entram
  // na lista de quem deve mandar dado.
  const coverage = await loadCoverageContext()
  const { data: platRows } = await admin
    .from("unit_platforms")
    .select("unit_id, platform")
    .eq("active", true)
  const linkedByPlatform = new Map<PlatformId, Set<string>>()
  for (const r of platRows ?? []) {
    const p = r.platform as PlatformId
    if (!shouldExpectDataForMonth(coverage, r.unit_id, p, year, month)) {
      continue
    }
    if (!linkedByPlatform.has(p)) linkedByPlatform.set(p, new Set())
    linkedByPlatform.get(p)!.add(r.unit_id)
  }

  // Log de importação do mês (só perStore iFood — pequeno e rápido).
  const { data: impRows } = await admin
    .from("platform_imports")
    .select("unit_id, platform, report_type")
    .eq("ref_year", year)
    .eq("ref_month", month)
    .eq("status", "success")
  const importedByKey = new Map<string, Set<string>>() // `${platform}/${report_type}` → unit_ids
  for (const r of impRows ?? []) {
    const k = `${r.platform}/${r.report_type}`
    if (!importedByKey.has(k)) importedByKey.set(k, new Set())
    if (r.unit_id) importedByKey.get(k)!.add(r.unit_id)
  }

  const reports = await Promise.all(
    REPORTS.map(async (rep): Promise<ReportStatus> => {
      if (rep.perStore) {
        const linked = linkedByPlatform.get(rep.platform) ?? new Set<string>()
        const imported =
          importedByKey.get(`${rep.platform}/${rep.importReportType}`) ??
          new Set<string>()
        const presentLinked = [...linked].filter((id) => imported.has(id))
        const missingCodes = [...linked]
          .filter((id) => !imported.has(id))
          .map((id) => idToCode.get(id))
          .filter((c): c is string => !!c)
          .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
        const status: ChecklistStatus =
          linked.size === 0
            ? "falta"
            : missingCodes.length === 0
              ? "ok"
              : presentLinked.length > 0
                ? "parcial"
                : "falta"
        return {
          platform: rep.platform,
          key: rep.key,
          label: rep.label,
          cadencia: rep.cadencia,
          perStore: true,
          status,
          unitsWithData: presentLinked.length,
          totalLinked: linked.size,
          missingCodes,
          lastDate: null,
          lagDays: null,
        }
      }

      // Rede: última data com dado no mês (order desc limit 1).
      const { data: last } = await admin
        .from(rep.table!)
        .select(rep.dateCol!)
        .gte(rep.dateCol!, startIso)
        .lt(rep.dateCol!, endExcl)
        .order(rep.dateCol!, { ascending: false })
        .limit(1)
      const lastRaw = (last?.[0] as Record<string, string> | undefined)?.[
        rep.dateCol!
      ]
      const lastDate = lastRaw ? lastRaw.slice(0, 10) : null
      let lagDays: number | null = null
      let status: ChecklistStatus = "falta"
      if (lastDate) {
        lagDays = Math.max(
          0,
          Math.round((target.getTime() - parseYmd(lastDate).getTime()) / 86_400_000),
        )
        const tol = rep.cadencia === "semanal" ? 7 : 0
        status = lagDays <= tol ? "ok" : "atrasado"
      }
      return {
        platform: rep.platform,
        key: rep.key,
        label: rep.label,
        cadencia: rep.cadencia,
        perStore: false,
        status,
        unitsWithData: 0,
        totalLinked: 0,
        missingCodes: [],
        lastDate,
        lagDays,
      }
    }),
  )

  let okCount = 0
  let atrasadoCount = 0
  let faltaCount = 0
  for (const r of reports) {
    if (r.status === "ok") okCount++
    else if (r.status === "falta") faltaCount++
    else atrasadoCount++ // parcial + atrasado
  }

  return {
    year,
    month,
    totalUnits: units.length,
    reports,
    okCount,
    atrasadoCount,
    faltaCount,
  }
}
