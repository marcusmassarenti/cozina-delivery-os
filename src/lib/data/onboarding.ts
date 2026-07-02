import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"

/**
 * Progresso dos "Primeiros passos" da empresa (holding) do usuário logado.
 * Detecta o que já foi feito pra o checklist guiado destravar os passos:
 *   1) Personalização (logo da empresa)
 *   2) Cadastro de unidade(s)
 *   3) Primeira importação de relatório
 */
export type OnboardingProgress = {
  hasLogo: boolean
  hasUnits: boolean
  hasImported: boolean
  done: number
  total: number
}

export async function getOnboardingProgress(): Promise<OnboardingProgress | null> {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return null

  const admin = createAdminClient()

  // 1) Logo da empresa
  const { data: h } = await admin
    .from("holdings")
    .select("logo_url")
    .eq("id", holdingId)
    .maybeSingle()
  const hasLogo = !!(h?.logo_url as string | null)

  // 2) Unidades
  const { data: brands } = await admin
    .from("brands")
    .select("id")
    .eq("holding_id", holdingId)
  const brandIds = (brands ?? []).map((b) => b.id)
  let unitIds: string[] = []
  if (brandIds.length) {
    const { data: units } = await admin
      .from("units")
      .select("id")
      .in("brand_id", brandIds)
    unitIds = (units ?? []).map((u) => u.id)
  }
  const hasUnits = unitIds.length > 0

  // 3) Primeira importação
  let hasImported = false
  if (unitIds.length) {
    const { count } = await admin
      .from("platform_imports")
      .select("id", { count: "exact", head: true })
      .in("unit_id", unitIds)
    hasImported = (count ?? 0) > 0
  }

  const done = [hasLogo, hasUnits, hasImported].filter(Boolean).length
  return { hasLogo, hasUnits, hasImported, done, total: 3 }
}
