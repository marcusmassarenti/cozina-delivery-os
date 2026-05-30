/**
 * Checklist de importação do mês: pra cada um dos 10 relatórios (iFood 4,
 * 99 Food 3, Keeta 3), diz se já foi importado e, nos que são POR LOJA
 * (iFood Conciliação e Pedidos), quais lojas ainda faltam.
 *
 * Fonte = tabelas de dados (o que as telas realmente usam), não o log de
 * importação (cujo report_type é ambíguo entre plataformas).
 */

import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getUnits } from "@/lib/data/units"
import type { PlatformId } from "@/components/platform-logo"

type ReportDef = {
  platform: PlatformId
  key: string
  label: string
  /** True = precisa de 1 arquivo por loja (mostra quais faltam) */
  perStore: boolean
  table: string
  /** "ref" = ref_year/ref_month · "date" = range em dateCol */
  mode: "ref" | "date"
  dateCol?: string
}

const REPORTS: ReportDef[] = [
  { platform: "ifood", key: "conciliacao", label: "Conciliação / Repasse", perStore: true, table: "ifood_financeiro_lancamentos", mode: "ref" },
  { platform: "ifood", key: "pedidos", label: "Relatório de pedidos (VR)", perStore: true, table: "ifood_pedidos", mode: "ref" },
  { platform: "ifood", key: "avaliacoes", label: "Avaliações", perStore: false, table: "ifood_avaliacoes", mode: "date", dateCol: "data_avaliacao" },
  { platform: "ifood", key: "cardapio", label: "Cardápio", perStore: false, table: "ifood_cardapio_periodo", mode: "date", dateCol: "period_start" },
  { platform: "99food", key: "loja", label: "Dados da loja", perStore: false, table: "ninefood_daily_loja", mode: "ref" },
  { platform: "99food", key: "item", label: "Dados do item", perStore: false, table: "ninefood_daily_item", mode: "date", dateCol: "data" },
  { platform: "99food", key: "pedido", label: "Dados do pedido", perStore: false, table: "ninefood_pedidos", mode: "ref" },
  { platform: "keeta", key: "restaurante", label: "Dados do restaurante", perStore: false, table: "keeta_daily_loja", mode: "ref" },
  { platform: "keeta", key: "pedido", label: "Dados do pedido", perStore: false, table: "keeta_pedidos", mode: "ref" },
  { platform: "keeta", key: "item", label: "Dados do item", perStore: false, table: "keeta_daily_item", mode: "ref" },
]

export type ReportStatus = {
  platform: PlatformId
  key: string
  label: string
  perStore: boolean
  unitsWithData: number
  totalUnits: number
  missingCodes: string[]
  imported: boolean
}

export type ImportChecklist = {
  year: number
  month: number
  totalUnits: number
  reports: ReportStatus[]
}

function pad2(n: number) {
  return String(n).padStart(2, "0")
}

async function distinctUnitIds(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: Array<{ unit_id: string | null }> | null
    error: { message: string } | null
  }>,
): Promise<Set<string>> {
  const set = new Set<string>()
  let from = 0
  const pageSize = 1000
  for (let i = 0; i < 200; i++) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) {
      console.error("import-checklist distinctUnitIds:", error.message)
      break
    }
    if (!data || data.length === 0) break
    for (const r of data) if (r.unit_id) set.add(r.unit_id)
    if (data.length < pageSize) break
    from += pageSize
  }
  return set
}

export async function getImportChecklistForMonth(
  year: number,
  month: number,
): Promise<ImportChecklist> {
  const admin = createAdminClient()
  const units = (await getUnits()).filter((u) => u.active)
  const activeIds = new Set(units.map((u) => u.id))
  const idToCode = new Map(units.map((u) => [u.id, u.code]))

  const startIso = `${year}-${pad2(month)}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const endExcl = `${nextYear}-${pad2(nextMonth)}-01`

  const reports = await Promise.all(
    REPORTS.map(async (rep): Promise<ReportStatus> => {
      const set = await distinctUnitIds((from, to) => {
        const base = admin.from(rep.table).select("unit_id")
        const filtered =
          rep.mode === "ref"
            ? base.eq("ref_year", year).eq("ref_month", month)
            : base.gte(rep.dateCol!, startIso).lt(rep.dateCol!, endExcl)
        return filtered.order("id").range(from, to)
      })

      const presentCodes = new Set<string>()
      for (const id of set) {
        if (activeIds.has(id)) {
          const code = idToCode.get(id)
          if (code) presentCodes.add(code)
        }
      }
      const missingCodes = rep.perStore
        ? units.filter((u) => !presentCodes.has(u.code)).map((u) => u.code)
        : []

      return {
        platform: rep.platform,
        key: rep.key,
        label: rep.label,
        perStore: rep.perStore,
        unitsWithData: presentCodes.size,
        totalUnits: units.length,
        missingCodes,
        imported: set.size > 0,
      }
    }),
  )

  return { year, month, totalUnits: units.length, reports }
}
