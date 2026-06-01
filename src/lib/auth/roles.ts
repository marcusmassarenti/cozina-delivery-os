/**
 * Papéis do sistema (admin / gerente / franqueado) e o que cada um pode.
 * Fonte do papel: profiles.perfil → fallback user_unit_access.
 * Espelha a função SQL public.app_role() (migration 0027).
 */
import "server-only"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export type AppRole = "admin" | "gerente" | "franqueado"

export type RoleCaps = {
  /** Importar relatórios, editar custos/metas das lojas. */
  canEdit: boolean
  /** Apagar registros (unidades, lançamentos, importações). */
  canDelete: boolean
  /** Criar/editar usuários e acessos (gestão de quem entra). */
  canManageUsers: boolean
  /** Enxerga a rede inteira (vs só a própria loja). */
  holdingWide: boolean
}

export const ROLE_CAPS: Record<AppRole, RoleCaps> = {
  admin: {
    canEdit: true,
    canDelete: true,
    canManageUsers: true,
    holdingWide: true,
  },
  gerente: {
    canEdit: true,
    canDelete: false,
    canManageUsers: false,
    holdingWide: true,
  },
  franqueado: {
    canEdit: false,
    canDelete: false,
    canManageUsers: false,
    holdingWide: false,
  },
}

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  franqueado: "Franqueado",
}

function normalizePerfil(perfil?: string | null): AppRole | null {
  const p = (perfil ?? "").toLowerCase().trim()
  if (p === "administrador" || p === "admin") return "admin"
  if (p === "gerente" || p === "manager") return "gerente"
  if (p === "franqueado" || p === "franchisee") return "franqueado"
  return null
}

/**
 * Papel do usuário logado. Prioriza profiles.perfil; cai pro escopo em
 * user_unit_access. Fail-closed: sem sessão ou indefinido → franqueado.
 */
export async function getUserRole(): Promise<AppRole> {
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()
  if (!authData?.user) return "franqueado"

  const userId = authData.user.id
  const admin = createAdminClient()

  const [profileRes, accessRes] = await Promise.all([
    admin.from("profiles").select("perfil").eq("user_id", userId).maybeSingle(),
    admin
      .from("user_unit_access")
      .select("scope_type, role")
      .eq("user_id", userId),
  ])

  const fromPerfil = normalizePerfil(profileRes.data?.perfil)
  if (fromPerfil) return fromPerfil

  const accesses = accessRes.data ?? []
  if (
    accesses.some((a) => a.scope_type === "holding" && a.role === "admin")
  ) {
    return "admin"
  }
  if (accesses.some((a) => a.scope_type === "holding" || a.scope_type === "brand")) {
    return "gerente"
  }
  return "franqueado"
}

/** Helper: o papel pode tal capacidade? */
export function roleCan(role: AppRole, cap: keyof RoleCaps): boolean {
  return ROLE_CAPS[role][cap]
}

/**
 * IDs das unidades que o usuário logado pode enxergar.
 *
 *  - admin / gerente (holdingWide) → `null` = "todas as lojas" (sem filtro)
 *  - franqueado                    → array com as units vinculadas em
 *    user_unit_access (escopo 'unit' direto + units das brands que ele
 *    tenha escopo 'brand'). Fail-closed: sem sessão ou sem vínculo → `[]`
 *    (vê vazio, NUNCA "todas").
 *
 * Use no topo das páginas via `getVisibleUnits()` (units.ts), que cruza
 * isto com a lista completa cacheada.
 */
export async function getAccessibleUnitIds(): Promise<string[] | null> {
  const role = await getUserRole()
  if (ROLE_CAPS[role].holdingWide) return null // admin/gerente = todas

  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()
  if (!authData?.user) return [] // sem sessão → nada (fail-closed)

  const userId = authData.user.id
  const admin = createAdminClient()

  const { data: accesses } = await admin
    .from("user_unit_access")
    .select("scope_type, scope_id")
    .eq("user_id", userId)

  const unitIds = new Set<string>()
  const brandIds: string[] = []
  for (const a of accesses ?? []) {
    if (a.scope_type === "unit" && a.scope_id) unitIds.add(a.scope_id)
    else if (a.scope_type === "brand" && a.scope_id) brandIds.push(a.scope_id)
  }

  // Escopo de brand → puxa todas as units daquela(s) marca(s).
  if (brandIds.length > 0) {
    const { data: brandUnits } = await admin
      .from("units")
      .select("id")
      .in("brand_id", brandIds)
    for (const u of brandUnits ?? []) unitIds.add(u.id)
  }

  return [...unitIds]
}
