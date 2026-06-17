/**
 * Helper de cobertura por (unit, platform, período).
 *
 * Combina 3 fontes de verdade pra decidir se uma loja deve ter dado num
 * período (mês ou dia):
 *
 *   1. `unit_platforms.data_inauguracao` — antes disso, ainda não operava
 *   2. `unit_platforms.data_encerramento` — depois disso, parou de operar
 *   3. `unit_platform_pauses` — períodos pontuais de pausa
 *
 * Quem usa: `import-checklist.ts` e `attention.ts` filtram lojas pausadas
 * pra não reportar "falta dado" indevido.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import type { PlatformId } from "@/components/platform-logo"

export type UnitPlatformStatus = {
  unitId: string
  platform: PlatformId
  active: boolean
  dataInauguracao: string | null
  dataEncerramento: string | null
}

export type UnitPlatformPause = {
  unitId: string
  platform: PlatformId
  periodoInicio: string // YYYY-MM-DD
  periodoFim: string | null
  motivo: string | null
}

export type CoverageContext = {
  /** unit_id → { platform → status } */
  platforms: Map<string, Map<PlatformId, UnitPlatformStatus>>
  /** unit_id → platform → lista de pausas */
  pauses: Map<string, Map<PlatformId, UnitPlatformPause[]>>
}

/**
 * Carrega tudo que precisa pra decidir cobertura: vinculações + pausas.
 * Faz 2 queries (vinculações ativas + pausas), monta os mapas.
 */
export async function loadCoverageContext(): Promise<CoverageContext> {
  const admin = createAdminClient()

  const [{ data: links }, { data: pauseRows }] = await Promise.all([
    admin
      .from("unit_platforms")
      .select("unit_id, platform, active, data_inauguracao, data_encerramento")
      .eq("active", true),
    admin
      .from("unit_platform_pauses")
      .select("unit_id, platform, periodo_inicio, periodo_fim, motivo"),
  ])

  const platforms = new Map<string, Map<PlatformId, UnitPlatformStatus>>()
  for (const r of (links ?? []) as Array<{
    unit_id: string
    platform: PlatformId
    active: boolean
    data_inauguracao: string | null
    data_encerramento: string | null
  }>) {
    if (!platforms.has(r.unit_id)) platforms.set(r.unit_id, new Map())
    platforms.get(r.unit_id)!.set(r.platform, {
      unitId: r.unit_id,
      platform: r.platform,
      active: r.active,
      dataInauguracao: r.data_inauguracao,
      dataEncerramento: r.data_encerramento,
    })
  }

  const pauses = new Map<string, Map<PlatformId, UnitPlatformPause[]>>()
  for (const r of (pauseRows ?? []) as Array<{
    unit_id: string
    platform: PlatformId
    periodo_inicio: string
    periodo_fim: string | null
    motivo: string | null
  }>) {
    if (!pauses.has(r.unit_id)) pauses.set(r.unit_id, new Map())
    const byPlatform = pauses.get(r.unit_id)!
    if (!byPlatform.has(r.platform)) byPlatform.set(r.platform, [])
    byPlatform.get(r.platform)!.push({
      unitId: r.unit_id,
      platform: r.platform,
      periodoInicio: r.periodo_inicio,
      periodoFim: r.periodo_fim,
      motivo: r.motivo,
    })
  }

  return { platforms, pauses }
}

/** YYYY-MM-DD ≤ YYYY-MM-DD (lexicográfico funciona pra ISO date). */
function dateLte(a: string, b: string): boolean {
  return a <= b
}
function dateGte(a: string, b: string): boolean {
  return a >= b
}

/**
 * Verifica se a loja operou EM ALGUM dia entre [refStart, refEnd] na
 * plataforma. Se o período inteiro está dentro de uma pausa, ou fora do
 * intervalo de operação (inauguração/encerramento), retorna false — daí
 * não deve cobrar dado.
 *
 * Política: BASTA 1 DIA OPERANDO no período pra considerar coberto.
 * Assim, se a loja inaugurou dia 25/jun, ainda esperamos dado de junho
 * (parcial). Mesma coisa pra pausa que termina no meio do mês.
 */
export function shouldExpectData(
  ctx: CoverageContext,
  unitId: string,
  platform: PlatformId,
  refStart: string, // YYYY-MM-DD inclusivo
  refEnd: string, // YYYY-MM-DD inclusivo
): boolean {
  const status = ctx.platforms.get(unitId)?.get(platform)
  if (!status || !status.active) return false

  // Janela efetiva de operação: max(refStart, inauguracao) ... min(refEnd, encerramento)
  const operStart =
    status.dataInauguracao && dateGte(status.dataInauguracao, refStart)
      ? status.dataInauguracao
      : refStart
  const operEnd =
    status.dataEncerramento && dateLte(status.dataEncerramento, refEnd)
      ? status.dataEncerramento
      : refEnd

  if (operStart > operEnd) return false // não operou no período

  // Aplica pausas: se TODA a janela [operStart, operEnd] está coberta por
  // pausas, não esperamos dado. Simplificação: se há pelo menos uma pausa
  // que cobre o período inteiro, exclui.
  const pauses = ctx.pauses.get(unitId)?.get(platform) ?? []
  for (const p of pauses) {
    const pStart = p.periodoInicio
    const pEnd = p.periodoFim ?? "9999-12-31" // pausa em aberto
    if (dateLte(pStart, operStart) && dateGte(pEnd, operEnd)) {
      return false // pausa cobre toda a janela
    }
  }

  return true
}

/** Wrapper conveniente pra mês inteiro: ano+mes 1..12. */
export function shouldExpectDataForMonth(
  ctx: CoverageContext,
  unitId: string,
  platform: PlatformId,
  year: number,
  month: number,
): boolean {
  const pad = (n: number) => String(n).padStart(2, "0")
  const start = `${year}-${pad(month)}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${pad(month)}-${pad(lastDay)}`
  return shouldExpectData(ctx, unitId, platform, start, end)
}
