import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import {
  ALL_REPORT_KEYS,
  DEFAULT_ENABLED_REPORTS,
  type ReportKey,
} from "@/lib/reports-catalog"

/**
 * Lê o mapa bruto de habilitação da holding. NULL no banco (nunca configurou)
 * vira os essenciais ligados.
 */
async function readEnabledMap(
  holdingId: string,
): Promise<Record<string, boolean> | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("holdings")
    .select("enabled_reports")
    .eq("id", holdingId)
    .maybeSingle()
  return (data?.enabled_reports as Record<string, boolean> | null) ?? null
}

/** Aplica o mapa salvo sobre o default (essenciais). Override parcial: só as
 *  keys presentes no mapa salvo mandam; keys AUSENTES (ex.: relatório novo
 *  adicionado ao catálogo depois que a holding salvou) caem no default. Assim
 *  um relatório essencial novo não nasce desligado pra quem já configurou. */
function resolvePrefs(
  saved: Record<string, boolean> | null,
): Record<ReportKey, boolean> {
  const out = {} as Record<ReportKey, boolean>
  for (const key of ALL_REPORT_KEYS) {
    out[key] =
      saved && key in saved
        ? Boolean(saved[key])
        : DEFAULT_ENABLED_REPORTS.includes(key)
  }
  return out
}

/** Mapa completo report_key → habilitado (pra a tela de config). */
export async function getReportPrefs(): Promise<Record<ReportKey, boolean>> {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return resolvePrefs(null)
  return resolvePrefs(await readEnabledMap(holdingId))
}

/** Conjunto das keys habilitadas (pra filtrar guia, cobertura, diagnóstico). */
export async function getEnabledReports(): Promise<Set<ReportKey>> {
  const prefs = await getReportPrefs()
  return new Set(
    (Object.keys(prefs) as ReportKey[]).filter((k) => prefs[k]),
  )
}

/** Habilitados de uma holding específica (uso interno/cobertura em lote). */
export async function getEnabledReportsForHolding(
  holdingId: string,
): Promise<Set<ReportKey>> {
  const prefs = resolvePrefs(await readEnabledMap(holdingId))
  return new Set((Object.keys(prefs) as ReportKey[]).filter((k) => prefs[k]))
}
