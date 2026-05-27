"use server"

import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"

export type AppUser = {
  id: string
  email: string
  fullName: string | null
  perfil: string
  createdAt: string
  lastSignInAt: string | null
}

export type UserActionState = {
  ok: boolean
  message?: string
  fieldErrors?: Record<string, string>
}

const initial: UserActionState = { ok: false }

export async function listUsers(): Promise<AppUser[]> {
  const supabase = createAdminClient()
  const [authRes, profilesRes] = await Promise.all([
    supabase.auth.admin.listUsers(),
    supabase.from("profiles").select("user_id, full_name, perfil"),
  ])
  if (authRes.error) throw new Error(authRes.error.message)

  const profileByUserId = new Map<
    string,
    { full_name: string | null; perfil: string }
  >()
  for (const p of profilesRes.data ?? []) {
    profileByUserId.set(p.user_id, {
      full_name: p.full_name,
      perfil: p.perfil ?? "viewer",
    })
  }

  return authRes.data.users.map((u) => {
    const p = profileByUserId.get(u.id)
    return {
      id: u.id,
      email: u.email ?? "—",
      fullName: p?.full_name ?? null,
      perfil: p?.perfil ?? "viewer",
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
    }
  })
}

function validatePassword(p: string): string | null {
  if (p.length < 6) return "Senha precisa de pelo menos 6 caracteres"
  return null
}

export async function createUser(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const fullName = String(formData.get("fullName") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")
  const perfil = String(formData.get("perfil") ?? "viewer").trim()

  const fieldErrors: Record<string, string> = {}
  if (!fullName) fieldErrors.fullName = "Nome obrigatório"
  if (!email || !email.includes("@")) fieldErrors.email = "Email inválido"
  const pwErr = validatePassword(password)
  if (pwErr) fieldErrors.password = pwErr

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: "Corrija os campos destacados." }
  }

  try {
    const supabase = createAdminClient()
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

    // O trigger já cria a row de profile. Atualizamos com nome e perfil.
    if (data.user) {
      await supabase
        .from("profiles")
        .update({ full_name: fullName, perfil })
        .eq("user_id", data.user.id)
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
  const perfil = String(formData.get("perfil") ?? "viewer").trim()

  if (!userId) return { ok: false, message: "ID do usuário ausente." }

  const fieldErrors: Record<string, string> = {}
  if (!fullName) fieldErrors.fullName = "Nome obrigatório"
  if (password && validatePassword(password)) {
    fieldErrors.password = validatePassword(password)!
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: "Corrija os campos destacados." }
  }

  try {
    const supabase = createAdminClient()

    const { error: profileErr } = await supabase
      .from("profiles")
      .update({ full_name: fullName, perfil, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
    if (profileErr) return { ok: false, message: profileErr.message }

    if (password) {
      const { error: pwErr } = await supabase.auth.admin.updateUserById(
        userId,
        { password },
      )
      if (pwErr) return { ok: false, message: pwErr.message }
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

export async function deleteUser(userId: string): Promise<UserActionState> {
  if (!userId) return { ok: false, message: "ID do usuário ausente." }
  try {
    const supabase = createAdminClient()
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
