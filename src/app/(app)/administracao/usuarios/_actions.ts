"use server"

import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { requireAdmin, requireModulePermission } from "@/lib/auth/guards"
import { getRolesConfig } from "@/lib/auth/permissions"

/** Escopo de dados do perfil (vem da tela de Permissões). Default: holding. */
async function roleScope(perfilKey: string): Promise<"holding" | "unit"> {
  const roles = await getRolesConfig()
  return roles.find((r) => r.key === perfilKey)?.dataScope ?? "holding"
}

/**
 * Allow-list de perfis: só aceita keys que existem em app_roles. Impede
 * escalonamento via perfil arbitrário (ex: gravar perfil="administrador" num
 * sistema sem essa role, ou um valor inventado que caia em fallback inseguro).
 */
async function isPerfilValido(perfilKey: string): Promise<boolean> {
  const roles = await getRolesConfig()
  return roles.some((r) => r.key === perfilKey)
}

export type AppUser = {
  id: string
  email: string
  fullName: string | null
  perfil: string
  unitId: string | null
  unitCode: string | null
  unitName: string | null
  createdAt: string
  lastSignInAt: string | null
}

export type UserActionState = {
  ok: boolean
  message?: string
  fieldErrors?: Record<string, string>
}

export async function listUsers(): Promise<AppUser[]> {
  const { admin: supabase } = await requireModulePermission("usuarios", "view")
  const [authRes, profilesRes, accessRes, unitsRes] = await Promise.all([
    supabase.auth.admin.listUsers(),
    supabase.from("profiles").select("user_id, full_name, perfil"),
    supabase
      .from("user_unit_access")
      .select("user_id, scope_type, scope_id")
      .eq("scope_type", "unit"),
    supabase.from("units").select("id, code, name"),
  ])
  if (authRes.error) throw new Error(authRes.error.message)

  const profileByUserId = new Map(
    (profilesRes.data ?? []).map((p) => [p.user_id, p]),
  )
  const accessByUserId = new Map(
    (accessRes.data ?? []).map((a) => [a.user_id, a.scope_id]),
  )
  const unitById = new Map(
    (unitsRes.data ?? []).map((u) => [u.id, u]),
  )

  return authRes.data.users.map((u) => {
    const p = profileByUserId.get(u.id)
    const unitId = accessByUserId.get(u.id) ?? null
    const unit = unitId ? unitById.get(unitId) : null
    return {
      id: u.id,
      email: u.email ?? "—",
      fullName: p?.full_name ?? null,
      perfil: p?.perfil ?? "franqueado",
      unitId,
      unitCode: unit?.code ?? null,
      unitName: unit?.name ?? null,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
    }
  })
}

function validatePassword(p: string): string | null {
  if (p.length < 6) return "Senha precisa de pelo menos 6 caracteres"
  return null
}

/**
 * Sincroniza user_unit_access com o ESCOPO do perfil (data_scope), não mais
 * com nomes fixos:
 * - holding → scope='holding' (role 'admin' só pro perfil 'administrador',
 *   senão 'manager') — vê a rede toda.
 * - unit    → scope='unit', scope_id=unitId — só a loja vinculada.
 */
async function syncAccess(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  perfil: string,
  unitId: string | null,
) {
  // Limpa rows antigas desse usuário
  await supabase.from("user_unit_access").delete().eq("user_id", userId)

  const scope = await roleScope(perfil)

  if (scope === "unit") {
    if (unitId) {
      await supabase.from("user_unit_access").insert({
        user_id: userId,
        scope_type: "unit",
        scope_id: unitId,
        role: "manager",
      })
    }
    return
  }

  // holding-scoped
  const { data: holding } = await supabase
    .from("holdings")
    .select("id")
    .eq("slug", "cozina-foods")
    .maybeSingle()
  if (holding) {
    await supabase.from("user_unit_access").insert({
      user_id: userId,
      scope_type: "holding",
      scope_id: holding.id,
      role: perfil === "administrador" ? "admin" : "manager",
    })
  }
}

export async function createUser(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const fullName = String(formData.get("fullName") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")
  const perfil = String(formData.get("perfil") ?? "franqueado").trim()
  const unitId = String(formData.get("unitId") ?? "").trim() || null

  const fieldErrors: Record<string, string> = {}
  if (!fullName) fieldErrors.fullName = "Nome obrigatório"
  if (!email || !email.includes("@")) fieldErrors.email = "Email inválido"
  const pwErr = validatePassword(password)
  if (pwErr) fieldErrors.password = pwErr
  if (!(await isPerfilValido(perfil)))
    fieldErrors.perfil = "Perfil inválido."
  if ((await roleScope(perfil)) === "unit" && !unitId)
    fieldErrors.unitId = "Selecione a unidade vinculada ao perfil"

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: "Corrija os campos destacados." }
  }

  try {
    // Só admin cria usuários (não basta usuarios:edit — evita escalonamento via
    // role custom com edit ligado).
    const { admin: supabase } = await requireAdmin()
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (error) {
      const msg = error.message.includes("already")
        ? "Já existe usuário com esse email."
        : error.message
      return { ok: false, message: msg }
    }

    if (data.user) {
      await supabase
        .from("profiles")
        .update({ full_name: fullName, perfil })
        .eq("user_id", data.user.id)

      await syncAccess(supabase, data.user.id, perfil, unitId)
    }

    revalidatePath("/administracao/usuarios")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro desconhecido",
    }
  }
}

export async function updateUser(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const userId = String(formData.get("userId") ?? "").trim()
  const fullName = String(formData.get("fullName") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const perfil = String(formData.get("perfil") ?? "franqueado").trim()
  const unitId = String(formData.get("unitId") ?? "").trim() || null

  if (!userId) return { ok: false, message: "ID do usuário ausente." }

  const fieldErrors: Record<string, string> = {}
  if (!fullName) fieldErrors.fullName = "Nome obrigatório"
  if (password && validatePassword(password))
    fieldErrors.password = validatePassword(password)!
  if (!(await isPerfilValido(perfil)))
    fieldErrors.perfil = "Perfil inválido."
  if ((await roleScope(perfil)) === "unit" && !unitId)
    fieldErrors.unitId = "Selecione a unidade vinculada ao perfil"

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: "Corrija os campos destacados." }
  }

  try {
    // Só admin altera perfil/senha/escopo de outros usuários.
    const { admin: supabase, userId: callerId } = await requireAdmin()

    const { error: profileErr } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        perfil,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
    if (profileErr) return { ok: false, message: profileErr.message }

    if (password) {
      const { error: pwErr } = await supabase.auth.admin.updateUserById(
        userId,
        { password },
      )
      if (pwErr) return { ok: false, message: pwErr.message }
    }

    // Bloqueia self-demote: admin não pode tirar o próprio perfil de admin
    if (callerId === userId && perfil !== "administrador") {
      return {
        ok: false,
        message:
          "Você não pode tirar seu próprio perfil de administrador. Peça pra outro admin.",
      }
    }

    await syncAccess(supabase, userId, perfil, unitId)

    revalidatePath("/administracao/usuarios")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro desconhecido",
    }
  }
}

export async function deleteUser(userId: string): Promise<UserActionState> {
  if (!userId) return { ok: false, message: "ID do usuário ausente." }
  try {
    // Só admin deleta usuários.
    const { admin: supabase, userId: callerId } = await requireAdmin()
    // Bloqueia self-delete
    if (callerId === userId) {
      return {
        ok: false,
        message: "Você não pode deletar a si mesmo.",
      }
    }
    const { error } = await supabase.auth.admin.deleteUser(userId)
    if (error) return { ok: false, message: error.message }
    revalidatePath("/administracao/usuarios")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro desconhecido",
    }
  }
}
