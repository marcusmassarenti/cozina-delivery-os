"use server"

import { revalidatePath, revalidateTag } from "next/cache"

import { requireModulePermission } from "@/lib/auth/guards"
import { MODULES, type DataScope } from "@/lib/auth/permissions"

export type PermActionState = { ok: boolean; message?: string; roleId?: string }

const VALID_MODULES = new Set<string>(MODULES.map((m) => m.key))

function slugify(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // tira acentos
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

type PermRow = {
  module: string
  view: boolean
  edit: boolean
  delete: boolean
}

/**
 * Salva o perfil: data_scope + matriz de permissões (upsert por módulo).
 * Não deixa mexer no perfil 'administrador' (anti-lockout — sempre existe um
 * perfil com acesso total).
 */
export async function saveRole(input: {
  roleId: string
  dataScope: DataScope
  perms: PermRow[]
}): Promise<PermActionState> {
  try {
    const { admin } = await requireModulePermission("usuarios", "edit")
    const { roleId, dataScope } = input
    if (!roleId) return { ok: false, message: "Perfil inválido." }
    if (dataScope !== "holding" && dataScope !== "unit") {
      return { ok: false, message: "Escopo inválido." }
    }

    const { data: role } = await admin
      .from("app_roles")
      .select("key")
      .eq("id", roleId)
      .maybeSingle()
    if (!role) return { ok: false, message: "Perfil não encontrado." }
    if (role.key === "administrador") {
      return {
        ok: false,
        message:
          "O Administrador tem acesso total e não é editável (evita travar o sistema).",
      }
    }

    const { error: roleErr } = await admin
      .from("app_roles")
      .update({ data_scope: dataScope })
      .eq("id", roleId)
    if (roleErr) return { ok: false, message: roleErr.message }

    const rows = input.perms
      .filter((p) => VALID_MODULES.has(p.module))
      .map((p) => ({
        role_id: roleId,
        module: p.module,
        can_view: !!p.view,
        can_edit: !!p.edit,
        can_delete: !!p.delete,
      }))
    if (rows.length > 0) {
      const { error: permErr } = await admin
        .from("role_module_perms")
        .upsert(rows, { onConflict: "role_id,module" })
      if (permErr) return { ok: false, message: permErr.message }
    }

    revalidateTag("rbac", "max")
    revalidatePath("/administracao/permissoes")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro desconhecido" }
  }
}

/** Cria um perfil custom (matriz começa toda em "não"). */
export async function createRole(input: {
  label: string
  dataScope: DataScope
}): Promise<PermActionState> {
  try {
    const { admin } = await requireModulePermission("usuarios", "edit")
    const label = input.label.trim()
    if (!label) return { ok: false, message: "Dê um nome ao perfil." }
    const key = slugify(label)
    if (!key) return { ok: false, message: "Nome inválido." }
    if (["administrador", "gerente", "franqueado"].includes(key)) {
      return { ok: false, message: "Esse nome é reservado de um perfil de sistema." }
    }

    const { data: role, error } = await admin
      .from("app_roles")
      .insert({
        key,
        label,
        is_system: false,
        data_scope: input.dataScope,
        sort_order: 100,
      })
      .select("id")
      .single()
    if (error) {
      return {
        ok: false,
        message:
          error.code === "23505"
            ? "Já existe um perfil com esse nome."
            : error.message,
      }
    }

    const rows = MODULES.map((m) => ({
      role_id: role.id,
      module: m.key,
      can_view: false,
      can_edit: false,
      can_delete: false,
    }))
    const { error: seedErr } = await admin
      .from("role_module_perms")
      .insert(rows)
    if (seedErr) return { ok: false, message: seedErr.message }

    revalidateTag("rbac", "max")
    revalidatePath("/administracao/permissoes")
    return { ok: true, roleId: role.id }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro desconhecido" }
  }
}

/** Apaga um perfil custom (perfis de sistema são bloqueados). */
export async function deleteRole(roleId: string): Promise<PermActionState> {
  try {
    const { admin } = await requireModulePermission("usuarios", "edit")
    if (!roleId) return { ok: false, message: "Perfil inválido." }

    const { data: role } = await admin
      .from("app_roles")
      .select("is_system, key")
      .eq("id", roleId)
      .maybeSingle()
    if (!role) return { ok: false, message: "Perfil não encontrado." }
    if (role.is_system) {
      return { ok: false, message: "Perfis de sistema não podem ser apagados." }
    }

    // Não apaga se houver usuários nesse perfil (evita órfãos).
    const { count } = await admin
      .from("profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("perfil", role.key)
    if ((count ?? 0) > 0) {
      return {
        ok: false,
        message: `Há ${count} usuário(s) nesse perfil. Mude-os de perfil antes de apagar.`,
      }
    }

    const { error } = await admin.from("app_roles").delete().eq("id", roleId)
    if (error) return { ok: false, message: error.message }

    revalidateTag("rbac", "max")
    revalidatePath("/administracao/permissoes")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro desconhecido" }
  }
}
