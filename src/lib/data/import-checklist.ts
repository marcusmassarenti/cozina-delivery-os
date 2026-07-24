/**
 * Saúde da importação: cada relatório tem uma CADÊNCIA (diário/semanal/mensal)
 * e é avaliado pelo que faz sentido pra ela:
 *
 *  - MENSAL por loja (iFood Conciliação e Pedidos): "completo" quando todas as
 *    lojas DAQUELA plataforma têm o mês. Mostra quais faltam (só lojas iFood —
 *    loja fora da plataforma não conta).
 *  - DIÁRIO / SEMANAL (99, Keeta, avaliações, cardápio): frescor — até que dia
 *    tem dado no mês. "Em dia" = dado dos últimos 5 dias (diário, tolerância de
 *    4) / últimos 7 dias (semanal). Senão, "atrasado N dias".
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
import { getAccessibleUnitIds } from "@/lib/auth/permissions"
import type { PlatformId } from "@/components/platform-logo"

export type Cadencia = "diario" | "semanal" | "mensal"
export type ChecklistStatus = "ok" | "parcial" | "atrasado" | "falta"

/** Dias de atraso que um relatório diário tolera antes de virar "atrasado". */
const DIARIO_TOLERANCIA_DIAS = 4

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
  { platform: "keeta", key: "fatura", label: "Fatura (repasse)", cadencia: "diario", perStore: false, table: "keeta_repasses", dateCol: "data_transacao" },
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
  /**
   * Relatório que entra sozinho pela API (não se cobra planilha dele).
   * Hoje: Avaliações do iFood nas lojas com o app habilitado — o cron diário
   * puxa. `autoUnits`/`autoTotal` dizem em quantas lojas isso já vale.
   */
  autoApi?: boolean
  autoUnits?: number
  autoTotal?: number
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
  // Isolamento multi-tenant: só as lojas da empresa do usuário (null =
  // super-admin de plataforma sem vínculo → vê tudo).
  const allowed = await getAccessibleUnitIds()
  const allowSet = allowed ? new Set(allowed) : null
  const units = (await getUnits()).filter(
    (u) => u.active && (!allowSet || allowSet.has(u.id)),
  )
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
    .select("unit_id, platform, review_enabled_at")
    .eq("active", true)
  const linkedByPlatform = new Map<PlatformId, Set<string>>()
  for (const r of platRows ?? []) {
    const p = r.platform as PlatformId
    if (allowSet && !allowSet.has(r.unit_id)) continue
    if (!shouldExpectDataForMonth(coverage, r.unit_id, p, year, month)) {
      continue
    }
    if (!linkedByPlatform.has(p)) linkedByPlatform.set(p, new Set())
    linkedByPlatform.get(p)!.add(r.unit_id)
  }

  // Plataformas realmente HABILITADAS no escopo (unit_platforms.active) — só
  // essas entram no checklist. Loja só-iFood não mostra linhas de 99/Keeta.
  const enabledPlatforms = new Set<PlatformId>()
  for (const r of platRows ?? []) {
    if (allowSet && !allowSet.has(r.unit_id)) continue
    enabledPlatforms.add(r.platform as PlatformId)
  }

  // Avaliações do iFood que entram SOZINHAS pela API: lojas com o app de
  // avaliações marcado como habilitado. Nelas o cron diário puxa e o sistema
  // para de cobrar a planilha.
  const ifoodLojas = linkedByPlatform.get("ifood") ?? new Set<string>()
  let reviewAuto = 0
  for (const r of platRows ?? []) {
    if (r.platform !== "ifood") continue
    if (!ifoodLojas.has(r.unit_id)) continue
    if (r.review_enabled_at) reviewAuto++
  }

  // Log de importação do mês (só perStore iFood — pequeno e rápido).
  let impQuery = admin
    .from("platform_imports")
    .select("unit_id, platform, report_type")
    .eq("ref_year", year)
    .eq("ref_month", month)
    .eq("status", "success")
  if (allowed) impQuery = impQuery.in("unit_id", allowed)
  const { data: impRows } = await impQuery
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

      // Rede: última data com dado no mês (order desc limit 1) — só das
      // lojas da empresa do usuário.
      let freshQ = admin
        .from(rep.table!)
        .select(rep.dateCol!)
        .gte(rep.dateCol!, startIso)
        .lt(rep.dateCol!, endExcl)
        .order(rep.dateCol!, { ascending: false })
        .limit(1)
      if (allowed) freshQ = freshQ.in("unit_id", allowed)
      const { data: last } = await freshQ
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
        // Tolerância antes de marcar "atrasado". Diário tolera 4 dias (só
        // acusa a partir de 5) — 1 dia de atraso é rotina e enchia a tela de
        // laranja à toa. Semanal tolera a própria janela de 7 dias.
        const tol = rep.cadencia === "semanal" ? 7 : DIARIO_TOLERANCIA_DIAS
        status = lagDays <= tol ? "ok" : "atrasado"
      }
      // Avaliações do iFood: nas lojas com o app habilitado o dado entra pela
      // API (cron diário) — não se cobra planilha. Se TODAS as lojas iFood do
      // escopo estão habilitadas, a linha é sempre "ok": está sincronizado.
      const autoApi =
        rep.platform === "ifood" && rep.key === "avaliacoes" && reviewAuto > 0
      if (autoApi) {
        const tudoAuto = reviewAuto >= ifoodLojas.size
        return {
          platform: rep.platform,
          key: rep.key,
          label: rep.label,
          cadencia: rep.cadencia,
          perStore: false,
          status: tudoAuto ? "ok" : status,
          unitsWithData: 0,
          totalLinked: 0,
          missingCodes: [],
          lastDate,
          lagDays,
          autoApi: true,
          autoUnits: reviewAuto,
          autoTotal: ifoodLojas.size,
        }
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

  // Só mostra as plataformas habilitadas no escopo.
  const reportsShown = reports.filter((r) => enabledPlatforms.has(r.platform))

  let okCount = 0
  let atrasadoCount = 0
  let faltaCount = 0
  for (const r of reportsShown) {
    if (r.status === "ok") okCount++
    else if (r.status === "falta") faltaCount++
    else atrasadoCount++ // parcial + atrasado
  }

  return {
    year,
    month,
    totalUnits: units.length,
    reports: reportsShown,
    okCount,
    atrasadoCount,
    faltaCount,
  }
}
