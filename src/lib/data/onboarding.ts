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

    /* Conectar por API JÁ É "trazer os dados" (Marcus, 23/08/26).
     *
     * `platform_imports` só ganha linha quando há o que gravar. Cliente novo
     * que conecta a loja e ainda não vendeu ficava com o passo aberto pra
     * sempre, sendo cobrado de fazer algo que ele já fez -- e que, no caminho
     * da API, ele nem faria (não há planilha pra subir). */
    if (!hasImported) {
      const { count: comApi } = await admin
        .from("unit_platforms")
        .select("unit_id", { count: "exact", head: true })
        .in("unit_id", unitIds)
        .eq("active", true)
        .not("api_store_id", "is", null)
      hasImported = (comApi ?? 0) > 0
    }
  }

  const done = [hasLogo, hasUnits, hasImported].filter(Boolean).length
  return { hasLogo, hasUnits, hasImported, done, total: 3 }
}
