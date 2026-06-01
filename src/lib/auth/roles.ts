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
