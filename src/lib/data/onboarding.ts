import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"

/**
 * Progresso dos "Primeiros passos" da empresa (holding) do usuário logado.
 *
 * O roteiro leva ao PRIMEIRO NÚMERO, não à configuração (22/09/26). Todo
 * cliente que ficou viu os números da própria loja em até um dia; Maracayá e
 * Master foods nunca viram e foram embora no fim do teste. Por isso:
 *   1) Cadastrar a loja (só o mínimo)
 *   2) Ver os números hoje — subir um relatório é instantâneo
 *   3) Deixar atualizando sozinho — a conexão, que leva dias no iFood
 * O logo, que era o passo 1, não mostra número nenhum e saiu do caminho.
 */
export type OnboardingProgress = {
  hasLogo: boolean
  hasUnits: boolean
  /** Já existe dado da loja no sistema (relatório subido ou vindo da API). */
  hasImported: boolean
  /** Alguma loja conectada por API (iFood, 99 ou Cardápio Web). */
  hasConnection: boolean
  /** Código da primeira loja — destino do "Conectar". */
  primeiraLoja: string | null
  /**
   * Situação do pedido de conexão do iFood, dita ao cliente com honestidade:
   * `nossa` = estamos cadastrando a loja no portal; `cliente` = já avisamos e
   * falta ele aprovar.
   */
  ifoodEspera: "nossa" | "cliente" | null
  /**
   * Conta que ainda não assina. O roteiro é pra ELA: cliente pagante que
   * escolheu ficar só na planilha não pode voltar a ver "conecte suas lojas"
   * toda vez que abre o painel.
   */
  emTeste: boolean
  /** Nome da empresa — vai pronto na mensagem do WhatsApp. */
  empresa: string | null
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
    .select("logo_url, paid, name")
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
  let primeiraLoja: string | null = null
  if (brandIds.length) {
    const { data: units } = await admin
      .from("units")
      .select("id, code, created_at")
      .in("brand_id", brandIds)
      .order("created_at")
    unitIds = (units ?? []).map((u) => u.id)
    primeiraLoja = (units?.[0]?.code as string | undefined) ?? null
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

  // 4) Conexão por API — qualquer plataforma. E o pedido do iFood em aberto,
  // pra dizer de quem é a vez em vez de deixar o cliente olhando o nada.
  let hasConnection = false
  let ifoodEspera: OnboardingProgress["ifoodEspera"] = null
  if (unitIds.length) {
    const [ifood, n99, cw, pedidos] = await Promise.all([
      admin
        .from("unit_platforms")
        .select("unit_id", { count: "exact", head: true })
        .in("unit_id", unitIds)
        .eq("active", true)
        .not("api_store_id", "is", null),
      admin
        .from("ninefood_store_links")
        .select("unit_id", { count: "exact", head: true })
        .in("unit_id", unitIds)
        .eq("active", true),
      admin
        .from("cardapioweb_installs")
        .select("unit_id", { count: "exact", head: true })
        .in("unit_id", unitIds)
        .eq("active", true),
      admin
        .from("ifood_activation_requests")
        .select("status")
        .eq("holding_id", holdingId)
        .in("status", ["pendente", "solicitada"]),
    ])
    hasConnection =
      (ifood.count ?? 0) + (n99.count ?? 0) + (cw.count ?? 0) > 0
    const status = (pedidos.data ?? []).map((r) => r.status as string)
    ifoodEspera = status.includes("solicitada")
      ? "cliente"
      : status.includes("pendente")
        ? "nossa"
        : null
  }

  const done = [hasUnits, hasImported, hasConnection].filter(Boolean).length
  return {
    hasLogo,
    hasUnits,
    hasImported,
    hasConnection,
    primeiraLoja,
    ifoodEspera,
    emTeste: !(h?.paid as boolean | null),
    empresa: (h?.name as string | null) ?? null,
    done,
    total: 3,
  }
}
