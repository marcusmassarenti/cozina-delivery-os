"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { todayISO } from "@/lib/data/billing"

export type SignUpState = {
  ok: boolean
  message?: string
  /** true = criado, falta confirmar o e-mail (tela "confira sua caixa"). */
  needsConfirmation?: boolean
  email?: string
}

/** slug seguro pra holding/brand a partir do nome da empresa. */
function slugify(s: string): string {
  const base = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
  return base || "empresa"
}

/** Hoje + N dias (America/Sao_Paulo), YYYY-MM-DD. */
function trialEndISO(days = 7): string {
  const base = new Date(`${todayISO()}T12:00:00-03:00`)
  base.setDate(base.getDate() + days)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(base)
}

export async function signUp(
  _prev: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const nome = String(formData.get("nome") ?? "").trim()
  const empresa = String(formData.get("empresa") ?? "").trim()
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  const senha = String(formData.get("senha") ?? "")
  const whatsapp = String(formData.get("whatsapp") ?? "").trim()

  if (!nome || !empresa || !email || !senha)
    return { ok: false, message: "Preencha nome, empresa, e-mail e senha." }
  if (!email.includes("@") || email.length < 5)
    return { ok: false, message: "E-mail inválido." }
  if (senha.length < 6)
    return { ok: false, message: "A senha precisa de pelo menos 6 caracteres." }

  const hdrs = await headers()
  const host = hdrs.get("host") ?? "deliveryos.food"
  const proto =
    hdrs.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https")
  const origin = `${proto}://${host}`

  const supabase = await createClient()
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email,
    password: senha,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: { full_name: nome, company: empresa, whatsapp: whatsapp || null },
    },
  })

  if (signUpErr) {
    const m = signUpErr.message.toLowerCase()
    if (m.includes("already") || m.includes("registered"))
      return { ok: false, message: "Esse e-mail já tem conta. Faça login." }
    if (m.includes("password"))
      return { ok: false, message: "Senha fraca — use pelo menos 6 caracteres." }
    return { ok: false, message: "Não foi possível criar a conta. Tenta de novo." }
  }

  // Anti-enumeração do Supabase: se o e-mail já existe, devolve user com
  // identities vazio. Tratamos como "já tem conta".
  if (
    signUpData.user &&
    Array.isArray(signUpData.user.identities) &&
    signUpData.user.identities.length === 0
  ) {
    return { ok: false, message: "Esse e-mail já tem conta. Faça login." }
  }
  const userId = signUpData.user?.id
  if (!userId)
    return { ok: false, message: "Não foi possível criar a conta. Tenta de novo." }

  // Cria a empresa (holding) + marca + acesso admin + trial de 7 dias.
  const admin = createAdminClient()
  const slugBase = slugify(empresa)
  const slug = `${slugBase}-${Math.random().toString(36).slice(2, 7)}`

  const { data: holding, error: hErr } = await admin
    .from("holdings")
    .insert({ name: empresa, slug, paid: false, trial_ends_at: trialEndISO(7) })
    .select("id")
    .single()
  if (hErr || !holding)
    return {
      ok: false,
      message: "Erro ao criar sua empresa. Tenta de novo em instantes.",
    }

  await admin
    .from("brands")
    .insert({ holding_id: holding.id, name: empresa, slug: slugBase })

  await admin.from("user_unit_access").insert({
    user_id: userId,
    scope_type: "holding",
    scope_id: holding.id,
    role: "admin",
  })

  await admin
    .from("profiles")
    .update({ full_name: nome, perfil: "administrador", onboarded: false })
    .eq("user_id", userId)

  // Se o projeto NÃO exige confirmação de e-mail, o Supabase já devolve sessão
  // → entra direto. Se exige, não há sessão → mostra "confira seu e-mail".
  if (signUpData.session) {
    redirect("/")
  }
  return { ok: true, needsConfirmation: true, email }
}
