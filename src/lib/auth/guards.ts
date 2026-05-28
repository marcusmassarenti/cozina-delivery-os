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

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

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
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    throw new AuthError("Sessão expirada. Faça login novamente.")
  }
  return { userId: data.user.id, email: data.user.email ?? null }
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
