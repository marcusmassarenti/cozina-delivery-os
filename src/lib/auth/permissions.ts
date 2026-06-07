/**
 * Motor de permissões (RBAC) — lê do banco (app_roles + role_module_perms),
 * cacheado. Substitui o antigo ROLE_CAPS fixo no código.
 *
 * Fonte do papel do usuário: profiles.perfil → app_roles.key.
 * Fallback (sem perfil reconhecido): escopo em user_unit_access → franqueado.
 *
 * data_scope do perfil:
 *   'holding' → enxerga a rede inteira (getAccessibleUnitIds = null)
 *   'unit'    → só as lojas vinculadas em user_unit_access
 */
import "server-only"

import { cache } from "react"
import { unstable_cache } from "next/cache"
import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Usuário autenticado, memoizado POR REQUEST (React cache). Várias funções
 * (requireAuth, getCurrentRole, getAccessibleUnitIds) precisam dele no mesmo
 * render — sem isto, cada uma bate no Supabase Auth e estoura rate limit.
 */
export const getAuthUser = cache(
  async (): Promise<{ id: string; email: string | null } | null> => {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    if (!data?.user) return null
    return { id: data.user.id, email: data.user.email ?? null }
  },
)

/**
 * Catálogo de módulos (linhas da matriz). Todo módulo expõe as 3 ações
 * (ver/editar/apagar) pra dar controle total na tela — mesmo que hoje algumas
 * ações ainda não tenham efeito num módulo só de leitura (ex.: editar no
 * Dashboard). O servidor só checa o par (módulo, ação) onde há server action.
 */
const ALL_ACTIONS = ["view", "edit", "delete"] as const

export const MODULES = [
  { key: "dashboard", label: "Dashboard", actions: ALL_ACTIONS },
  { key: "relatorios", label: "Relatórios", actions: ALL_ACTIONS },
  { key: "avaliacoes", label: "Avaliações", actions: ALL_ACTIONS },
  { key: "pedidos", label: "Pedidos", actions: ALL_ACTIONS },
  { key: "unidades", label: "Unidades", actions: ALL_ACTIONS },
  { key: "financeiro", label: "Financeiro", actions: ALL_ACTIONS },
  { key: "importacao", label: "Importação", actions: ALL_ACTIONS },
  { key: "usuarios", label: "Usuários", actions: ALL_ACTIONS },
  { key: "conexoes", label: "Conexões", actions: ALL_ACTIONS },
] as const

export type ModuleKey = (typeof MODULES)[number]["key"]
export type PermAction = "view" | "edit" | "delete"
export type DataScope = "holding" | "unit"

export type ModulePerm = { view: boolean; edit: boolean; delete: boolean }

export type RoleConfig = {
  id: string
  key: string
  label: string
  description: string | null
  isSystem: boolean
  dataScope: DataScope
  sortOrder: number
  /** Permissões por módulo (chave = ModuleKey). Módulo ausente = tudo false. */
  perms: Record<string, ModulePerm>
}

/** Perfil "negar tudo" — fallback de segurança se o banco vier vazio. */
const DENY_ALL: RoleConfig = {
  id: "",
  key: "__deny__",
  label: "Sem acesso",
  description: null,
  isSystem: true,
  dataScope: "unit",
  sortOrder: 999,
  perms: {},
}

/**
 * Carrega TODOS os perfis + a matriz, do banco. Cacheado (invalida com a tag
 * "rbac" quando a tela de permissões salva).
 */
async function loadRolesUncached(): Promise<RoleConfig[]> {
  const admin = createAdminClient()
  const [rolesRes, permsRes] = await Promise.all([
    admin
      .from("app_roles")
      .select("id, key, label, description, is_system, data_scope, sort_order")
      .order("sort_order"),
    admin
      .from("role_module_perms")
      .select("role_id, module, can_view, can_edit, can_delete"),
  ])

  const permsByRole = new Map<string, Record<string, ModulePerm>>()
  for (const p of permsRes.data ?? []) {
    const m = permsByRole.get(p.role_id) ?? {}
    m[p.module as string] = {
      view: !!p.can_view,
      edit: !!p.can_edit,
      delete: !!p.can_delete,
    }
    permsByRole.set(p.role_id, m)
  }

  return (rolesRes.data ?? []).map((r) => ({
    id: r.id as string,
    key: r.key as string,
    label: r.label as string,
    description: (r.description as string | null) ?? null,
    isSystem: !!r.is_system,
    dataScope: (r.data_scope as DataScope) ?? "unit",
    sortOrder: (r.sort_order as number) ?? 100,
    perms: permsByRole.get(r.id as string) ?? {},
  }))
}

export const getRolesConfig = unstable_cache(loadRolesUncached, ["rbac-roles-v1"], {
  revalidate: 300,
  tags: ["rbac"],
})

/** Normaliza profiles.perfil → app_roles.key. Custom keys passam direto. */
function normalizeRoleKey(perfil?: string | null): string | null {
  const p = (perfil ?? "").toLowerCase().trim()
  if (!p) return null
  if (p === "admin") return "administrador"
  if (p === "manager") return "gerente"
  if (p === "franchisee") return "franqueado"
  if (p === "viewer") return null // legado → cai no fallback (fail-closed)
  return p
}

/**
 * Perfil efetivo do usuário logado (registro completo, com perms).
 * Fail-closed: sem sessão / perfil indefinido → franqueado (ou deny se nem
 * franqueado existir no banco).
 */
export const getCurrentRole = cache(async (): Promise<RoleConfig> => {
  const roles = await getRolesConfig()
  const byKey = new Map(roles.map((r) => [r.key, r]))
  const fallback = byKey.get("franqueado") ?? DENY_ALL

  const user = await getAuthUser()
  if (!user) return fallback

  const userId = user.id
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from("profiles")
    .select("perfil")
    .eq("user_id", userId)
    .maybeSingle()

  const key = normalizeRoleKey(profile?.perfil)
  if (key && byKey.has(key)) return byKey.get(key)!

  // Fallback pelo escopo em user_unit_access
  const { data: accesses } = await admin
    .from("user_unit_access")
    .select("scope_type, role")
    .eq("user_id", userId)
  const list = accesses ?? []
  // Admin explícito (role='admin' em escopo holding) é sinal forte e seguro.
  if (
    list.some((a) => a.scope_type === "holding" && a.role === "admin") &&
    byKey.has("administrador")
  ) {
    return byKey.get("administrador")!
  }
  // Fail-CLOSED: perfil desconhecido NÃO é promovido a "gerente" por ter
  // qualquer row holding/brand (era brecha — concedia visão da rede inteira).
  // Cai no fallback (franqueado), que só enxerga via user_unit_access da loja.
  return fallback
})

/** O perfil do usuário pode `action` no `module`? Fail-closed (default false). */
export async function userCan(
  module: ModuleKey,
  action: PermAction,
): Promise<boolean> {
  const role = await getCurrentRole()
  return role.perms[module]?.[action] ?? false
}

/** Guard de página (Server Component): 404 se o perfil não pode ver o módulo. */
export async function assertCanView(module: ModuleKey): Promise<void> {
  if (!(await userCan(module, "view"))) notFound()
}

/**
 * Super-admin da PLATAFORMA (dono do SaaS). É o ÚNICO que vê todos os clientes
 * (todas as holdings). Privilégio EXPLÍCITO (`profiles.is_superadmin`), separado
 * do admin de um cliente — que só enxerga a própria empresa. Fail-closed.
 *
 * Multi-tenant: é isto que substitui o antigo "admin de holding = vê tudo".
 */
export const isSuperadmin = cache(async (): Promise<boolean> => {
  const user = await getAuthUser()
  if (!user) return false
  const admin = createAdminClient()
  const { data } = await admin
    .from("profiles")
    .select("is_superadmin")
    .eq("user_id", user.id)
    .maybeSingle()
  return !!data?.is_superadmin
})

/**
 * IDs das unidades visíveis pro usuário:
 *  - super-admin da plataforma → null (vê TODOS os clientes — o "ver tudo" mora
 *    SÓ aqui agora)
 *  - demais → SEMPRE um array concreto, escopado à(s) holding(s)/loja(s) do
 *    usuário (resolve holding → brands → units). NUNCA "todas as lojas do banco".
 * Fail-closed: sem sessão/sem vínculo → [] (vê vazio, nunca tudo).
 *
 * IMPORTANTE (isolamento multi-tenant): antes, admin de holding devolvia null =
 * "todas as lojas do banco" — o que vazaria entre clientes. Agora só o
 * super-admin EXPLÍCITO recebe null; um admin de cliente fica preso à própria
 * empresa, mesmo que o código esqueça de filtrar em algum lugar.
 */
export const getAccessibleUnitIds = cache(
  async (): Promise<string[] | null> => {
    if (await isSuperadmin()) return null

    const user = await getAuthUser()
    if (!user) return []

    const admin = createAdminClient()
    const { data: accesses } = await admin
      .from("user_unit_access")
      .select("scope_type, scope_id")
      .eq("user_id", user.id)

    const holdingIds: string[] = []
    const brandIds: string[] = []
    const unitIds = new Set<string>()
    for (const a of accesses ?? []) {
      if (a.scope_type === "holding" && a.scope_id) holdingIds.push(a.scope_id)
      else if (a.scope_type === "brand" && a.scope_id) brandIds.push(a.scope_id)
      else if (a.scope_type === "unit" && a.scope_id) unitIds.add(a.scope_id)
    }

    // holding → todas as brands da(s) holding(s)
    if (holdingIds.length > 0) {
      const { data: hBrands } = await admin
        .from("brands")
        .select("id")
        .in("holding_id", holdingIds)
      for (const b of hBrands ?? []) brandIds.push(b.id)
    }
    // brands → todas as units
    if (brandIds.length > 0) {
      const { data: bUnits } = await admin
        .from("units")
        .select("id")
        .in("brand_id", brandIds)
      for (const u of bUnits ?? []) unitIds.add(u.id)
    }
    return [...unitIds]
  },
)
