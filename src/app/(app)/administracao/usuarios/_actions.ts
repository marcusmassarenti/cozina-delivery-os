"use server"

import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { requireAdmin, requireModulePermission } from "@/lib/auth/guards"
import {
  getAccessibleUnitIds,
  getCurrentHoldingId,
  getRolesConfig,
} from "@/lib/auth/permissions"

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

export type UserUnitRef = { id: string; code: string; name: string }

export type AppUser = {
  id: string
  email: string
  fullName: string | null
  perfil: string
  /** Lojas vinculadas (franqueado pode ter mais de uma). */
  units: UserUnitRef[]
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

  // Multi-tenant: lista só os usuários da HOLDING do admin logado.
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return []

  // Marcas e lojas da holding (pra resolver quem pertence a ela).
  const { data: brandRows } = await supabase
    .from("brands")
    .select("id")
    .eq("holding_id", holdingId)
  const brandIds = (brandRows ?? []).map((b) => b.id as string)
  const { data: unitRows } = brandIds.length
    ? await supabase
        .from("units")
        .select("id, code, name")
        .in("brand_id", brandIds)
    : { data: [] as { id: string; code: string; name: string }[] }
  const holdingUnitIds = new Set((unitRows ?? []).map((u) => u.id))
  const brandIdSet = new Set(brandIds)

  const [authRes, profilesRes, accessRes] = await Promise.all([
    supabase.auth.admin.listUsers(),
    supabase.from("profiles").select("user_id, full_name, perfil"),
    supabase
      .from("user_unit_access")
      .select("user_id, scope_type, scope_id"),
  ])
  if (authRes.error) throw new Error(authRes.error.message)

  // Quem pertence à holding (qualquer escopo apontando pra ela) + as lojas
  // (unit) vinculadas a cada um DENTRO da holding.
  const memberUserIds = new Set<string>()
  const unitAccessByUser = new Map<string, string[]>()
  for (const a of accessRes.data ?? []) {
    if (!a.scope_id) continue
    const inHolding =
      (a.scope_type === "holding" && a.scope_id === holdingId) ||
      (a.scope_type === "brand" && brandIdSet.has(a.scope_id)) ||
      (a.scope_type === "unit" && holdingUnitIds.has(a.scope_id))
    if (inHolding) memberUserIds.add(a.user_id)
    if (a.scope_type === "unit" && holdingUnitIds.has(a.scope_id)) {
      const arr = unitAccessByUser.get(a.user_id) ?? []
      arr.push(a.scope_id)
      unitAccessByUser.set(a.user_id, arr)
    }
  }

  const profileByUserId = new Map(
    (profilesRes.data ?? []).map((p) => [p.user_id, p]),
  )
  const unitById = new Map((unitRows ?? []).map((u) => [u.id, u]))
  // Perfil fora do allow-list (ex.: 'viewer' default) cai em 'franqueado'.
  const validRoleKeys = new Set((await getRolesConfig()).map((r) => r.key))

  return authRes.data.users
    .filter((u) => memberUserIds.has(u.id))
    .map((u) => {
      const p = profileByUserId.get(u.id)
      const units = (unitAccessByUser.get(u.id) ?? [])
        .map((id) => unitById.get(id))
        .filter((x): x is { id: string; code: string; name: string } => !!x)
        .map((x) => ({ id: x.id, code: x.code, name: x.name }))
      const perfilRaw = p?.perfil ?? ""
      const perfil = validRoleKeys.has(perfilRaw) ? perfilRaw : "franqueado"
      return {
        id: u.id,
        email: u.email ?? "—",
        fullName: p?.full_name ?? null,
        perfil,
        units,
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
  unitIds: string[],
) {
  // Limpa rows antigas desse usuário
  await supabase.from("user_unit_access").delete().eq("user_id", userId)

  const scope = await roleScope(perfil)

  if (scope === "unit") {
    const ids = [...new Set(unitIds.filter(Boolean))]
    if (ids.length > 0) {
      await supabase.from("user_unit_access").insert(
        ids.map((scope_id) => ({
          user_id: userId,
          scope_type: "unit",
          scope_id,
          role: "manager",
        })),
      )
    }
    return
  }

  // holding-scoped → vincula à HOLDING do admin que está criando (multi-tenant),
  // não mais à Cozina fixa.
  const holdingId = await getCurrentHoldingId()
  if (holdingId) {
    await supabase.from("user_unit_access").insert({
      user_id: userId,
      scope_type: "holding",
      scope_id: holdingId,
      role: perfil === "administrador" ? "admin" : "manager",
    })
  }
}

/**
 * Valida que as lojas vinculadas estão no escopo do admin (anti cross-tenant).
 * Super-admin (allowed === null) pode qualquer loja. Devolve mensagem de erro
 * ou null se ok.
 */
async function assertUnitsInScope(unitIds: string[]): Promise<string | null> {
  if (unitIds.length === 0) return null
  const allowed = await getAccessibleUnitIds()
  if (allowed === null) return null
  const set = new Set(allowed)
  if (unitIds.some((id) => !set.has(id)))
    return "Uma das lojas selecionadas não pertence à sua empresa."
  return null
}

export async function createUser(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const fullName = String(formData.get("fullName") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")
  const perfil = String(formData.get("perfil") ?? "franqueado").trim()
  const unitIds = formData
    .getAll("unitIds")
    .map(String)
    .map((s) => s.trim())
    .filter(Boolean)

  const fieldErrors: Record<string, string> = {}
  if (!fullName) fieldErrors.fullName = "Nome obrigatório"
  if (!email || !email.includes("@")) fieldErrors.email = "Email inválido"
  const pwErr = validatePassword(password)
  if (pwErr) fieldErrors.password = pwErr
  if (!(await isPerfilValido(perfil)))
    fieldErrors.perfil = "Perfil inválido."
  if ((await roleScope(perfil)) === "unit" && unitIds.length === 0)
    fieldErrors.unitId = "Selecione ao menos uma loja vinculada ao perfil"
  const scopeErr = await assertUnitsInScope(unitIds)
  if (scopeErr) fieldErrors.unitId = scopeErr

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

      await syncAccess(supabase, data.user.id, perfil, unitIds)
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
  const unitIds = formData
    .getAll("unitIds")
    .map(String)
    .map((s) => s.trim())
    .filter(Boolean)

  if (!userId) return { ok: false, message: "ID do usuário ausente." }

  const fieldErrors: Record<string, string> = {}
  if (!fullName) fieldErrors.fullName = "Nome obrigatório"
  if (password && validatePassword(password))
    fieldErrors.password = validatePassword(password)!
  if (!(await isPerfilValido(perfil)))
    fieldErrors.perfil = "Perfil inválido."
  if ((await roleScope(perfil)) === "unit" && unitIds.length === 0)
    fieldErrors.unitId = "Selecione ao menos uma loja vinculada ao perfil"
  const scopeErr = await assertUnitsInScope(unitIds)
  if (scopeErr) fieldErrors.unitId = scopeErr

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

    await syncAccess(supabase, userId, perfil, unitIds)

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
