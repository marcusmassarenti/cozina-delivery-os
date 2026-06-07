/**
 * Guards de autenticação pra usar no topo de toda server action.
 *
 * Modelo de roles (segue user_unit_access do init.sql):
 *  - administrador → row com scope_type='holding', role='admin'
 *  - franqueado    → row com scope_type='unit', role='manager'
 *
 * Estes helpers TODOS jogam erro se a checagem falhar (fail-closed).
 * Server actions devem capturar e retornar `{ ok: false, message }`.
 */

import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  getAccessibleUnitIds,
  getAuthUser,
  isSuperadmin,
  userCan,
  type ModuleKey,
  type PermAction,
} from "@/lib/auth/permissions"

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AuthError"
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ForbiddenError"
  }
}

/**
 * Exige usuário logado. Use no topo de qualquer server action de operação
 * (CRUD de unidades, lançamentos, import).
 *
 * @throws AuthError se não houver sessão válida
 */
export async function requireAuth(): Promise<{
  userId: string
  email: string | null
}> {
  const user = await getAuthUser()
  if (!user) {
    throw new AuthError("Sessão expirada. Faça login novamente.")
  }
  return { userId: user.id, email: user.email }
}

/**
 * Exige usuário logado E com role admin na holding.
 * Use em actions de gestão de usuários, edição de holding/brand, etc.
 *
 * Aceita 2 caminhos pra ser admin (qualquer um basta):
 *  1. Row em `user_unit_access` com (scope_type='holding', role='admin')
 *     — caminho criado pelo `syncAccess()` quando user é criado via UI
 *  2. `profiles.perfil = 'administrador'`
 *     — caminho usado por usuários criados via Supabase Dashboard direto
 *
 * @throws AuthError se não houver sessão
 * @throws ForbiddenError se sessão existe mas usuário não é admin
 */
export async function requireAdmin(): Promise<{
  userId: string
  email: string | null
  admin: ReturnType<typeof createAdminClient>
}> {
  const { userId, email } = await requireAuth()
  const admin = createAdminClient()

  // Caminho 1: user_unit_access
  const { data: access } = await admin
    .from("user_unit_access")
    .select("scope_type, role")
    .eq("user_id", userId)
    .eq("scope_type", "holding")
    .eq("role", "admin")
    .maybeSingle()
  if (access) return { userId, email, admin }

  // Caminho 2: profiles.perfil = administrador (fallback defensivo)
  const { data: profile } = await admin
    .from("profiles")
    .select("perfil")
    .eq("user_id", userId)
    .maybeSingle()
  if (profile?.perfil === "administrador") {
    return { userId, email, admin }
  }

  throw new ForbiddenError(
    "Apenas administradores podem fazer essa operação.",
  )
}

/**
 * Exige usuário logado E super-admin da PLATAFORMA (dono do SaaS). Use em
 * ações que gerenciam TODOS os clientes (provisionar cliente, etc.).
 *
 * @throws AuthError se não houver sessão
 * @throws ForbiddenError se a sessão existe mas não é super-admin
 */
export async function requireSuperadmin(): Promise<{
  userId: string
  email: string | null
  admin: ReturnType<typeof createAdminClient>
}> {
  const { userId, email } = await requireAuth()
  if (!(await isSuperadmin())) {
    throw new ForbiddenError(
      "Apenas o super-admin da plataforma pode fazer essa operação.",
    )
  }
  return { userId, email, admin: createAdminClient() }
}

/**
 * Exige usuário logado E com permissão pra `action` (view/edit/delete) no
 * `module` (dashboard, unidades, financeiro, ...), conforme a matriz de
 * permissões do perfil (tabela role_module_perms, editável na tela).
 *
 * @throws AuthError se não houver sessão
 * @throws ForbiddenError se o perfil não tem a permissão
 */
export async function requireModulePermission(
  module: ModuleKey,
  action: PermAction,
): Promise<{
  userId: string
  email: string | null
  admin: ReturnType<typeof createAdminClient>
}> {
  const { userId, email } = await requireAuth()
  if (!(await userCan(module, action))) {
    throw new ForbiddenError("Seu perfil não tem permissão pra essa ação.")
  }
  return { userId, email, admin: createAdminClient() }
}

/**
 * Exige só usuário logado e devolve o admin client. Pra actions de
 * lançamento da PRÓPRIA loja (custos, fechamento, vinagrete), onde o
 * escopo certo é "acesso à unidade" — não a permissão GLOBAL de módulo.
 * Combine com requireUnitAccess / assertUnitAccess pra travar cross-tenant.
 */
export async function requireAuthWithAdmin(): Promise<{
  userId: string
  email: string | null
  admin: ReturnType<typeof createAdminClient>
}> {
  const { userId, email } = await requireAuth()
  return { userId, email, admin: createAdminClient() }
}

/**
 * Exige usuário logado COM acesso à unidade `unitId` (anti cross-tenant):
 *  - holding/admin (getAccessibleUnitIds === null) → acessa qualquer loja
 *  - franqueado → só as lojas vinculadas a ele
 * É o gate certo pra editar dados de UMA loja (custos, fechamento), pois o
 * franqueado gerencia a própria unidade mesmo sem permissão global de
 * financeiro:edit (que é da holding).
 *
 * @throws AuthError se não houver sessão
 * @throws ForbiddenError se a unidade não estiver no escopo do usuário
 */
export async function requireUnitAccess(unitId: string): Promise<{
  userId: string
  email: string | null
  admin: ReturnType<typeof createAdminClient>
}> {
  const { userId, email } = await requireAuth()
  const ids = await getAccessibleUnitIds()
  if (ids !== null && (!unitId || !ids.includes(unitId))) {
    throw new ForbiddenError("Você não tem acesso a esta unidade.")
  }
  return { userId, email, admin: createAdminClient() }
}

/**
 * Wrapper genérico pra capturar AuthError/ForbiddenError em actions que
 * retornam `{ ok, message }`. Reduz boilerplate.
 *
 * Uso:
 *   export async function minhaAction(_prev, formData) {
 *     return guard(async () => {
 *       const { userId } = await requireAuth()
 *       // ... lógica
 *       return { ok: true }
 *     })
 *   }
 */
export async function guard<T extends { ok: boolean; message?: string }>(
  fn: () => Promise<T>,
): Promise<T | { ok: false; message: string }> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof AuthError || e instanceof ForbiddenError) {
      return { ok: false, message: e.message }
    }
    throw e
  }
}
