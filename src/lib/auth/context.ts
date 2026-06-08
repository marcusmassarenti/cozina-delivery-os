/**
 * Resolve o contexto do usuário logado pra alimentar o TopBar
 * (nome, iniciais, brand). Roda no servidor (layout) e é passado pro
 * TopBar como props.
 *
 * Estratégia:
 *  - userId vem da sessão Supabase Auth
 *  - fullName vem de profiles
 *  - brandName depende do escopo de acesso:
 *      * administrador (scope='holding') → primeira brand da holding
 *      * franqueado (scope='unit') → brand da unit vinculada
 *      * fallback → primeira brand cadastrada
 */

import "server-only"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"

export type UserContext = {
  userId: string | null
  fullName: string
  initials: string
  brandName: string
  /** Logo da empresa (white-label). null = usa o logo padrão (Cozina). */
  logoUrl: string | null
  /** Já viu o tour de boas-vindas? (controla o onboarding do 1º login) */
  onboarded: boolean
}

const FALLBACK: UserContext = {
  userId: null,
  fullName: "Usuário",
  initials: "U",
  brandName: "Cozina Foods",
  logoUrl: null,
  onboarded: true,
}

export async function getCurrentUserContext(): Promise<UserContext> {
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()
  if (!authData?.user) return FALLBACK

  const userId = authData.user.id
  const admin = createAdminClient()

  // Busca em paralelo o profile e o acesso do usuário
  const [profileRes, accessRes] = await Promise.all([
    admin
      .from("profiles")
      .select("full_name")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("user_unit_access")
      .select("scope_type, scope_id, role")
      .eq("user_id", userId)
      .limit(5),
  ])

  const fullName =
    profileRes.data?.full_name?.trim() ||
    authData.user.email?.split("@")[0] ||
    "Usuário"

  // Resolve a brand baseado no escopo
  let brandName = "Cozina Foods"
  const accesses = accessRes.data ?? []

  // Caminho 1: administrador da holding → pega a brand da holding
  const holdingAccess = accesses.find(
    (a) => a.scope_type === "holding" && a.role === "admin",
  )
  if (holdingAccess) {
    const { data: brand } = await admin
      .from("brands")
      .select("name")
      .eq("holding_id", holdingAccess.scope_id)
      .limit(1)
      .maybeSingle()
    if (brand?.name) brandName = brand.name
  } else {
    // Caminho 2: franqueado → brand via unit
    const unitAccess = accesses.find((a) => a.scope_type === "unit")
    if (unitAccess) {
      const { data: unit } = await admin
        .from("units")
        .select("brand_id, brands(name)")
        .eq("id", unitAccess.scope_id)
        .maybeSingle()
      // Supabase tipa o join como array; pode vir array OU objeto
      const brandJoin = unit?.brands as
        | { name: string }
        | { name: string }[]
        | null
      const brand = Array.isArray(brandJoin) ? brandJoin[0] : brandJoin
      if (brand?.name) brandName = brand.name
    }
  }

  // Logo da empresa (white-label) — resolve pela holding do usuário.
  let logoUrl: string | null = null
  const holdingId = await getCurrentHoldingId()
  if (holdingId) {
    const { data: h } = await admin
      .from("holdings")
      .select("logo_url")
      .eq("id", holdingId)
      .maybeSingle()
    logoUrl = (h?.logo_url as string | null) ?? null
  }

  // Onboarding: default true (não mostra tour se não der pra determinar —
  // ex.: antes da migration). Só mostra quando lê explicitamente `false`.
  let onboarded = true
  const { data: ob } = await admin
    .from("profiles")
    .select("onboarded")
    .eq("user_id", userId)
    .maybeSingle()
  if (ob && ob.onboarded === false) onboarded = false

  return {
    userId,
    fullName,
    initials: computeInitials(fullName),
    brandName,
    logoUrl,
    onboarded,
  }
}

function computeInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0)
  if (parts.length === 0) return "U"
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
