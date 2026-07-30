"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { clientIp, rateLimit } from "@/lib/security/rate-limit"
import { verificarTurnstile } from "@/lib/security/turnstile"

export type SignInState = {
  ok: boolean
  message?: string
}

export async function signIn(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")

  if (!email || !password) {
    return { ok: false, message: "Preencha email e senha." }
  }

  // Anti brute-force: 10 tentativas / 5 min por IP (defesa própria, além do
  // limite do Supabase Auth).
  const ip = await clientIp()
  const dentro = await rateLimit(`login:${ip}`, 10, 5 * 60)
  if (!dentro) {
    return {
      ok: false,
      message: "Muitas tentativas. Espere alguns minutos e tente de novo.",
    }
  }

  // Turnstile: prova que há um navegador real. Cobre o que o rate-limit por IP
  // não cobre (botnet distribuída). Sem as chaves configuradas, passa direto.
  const captcha = await verificarTurnstile(
    String(formData.get("cf-turnstile-response") ?? "") || null,
    ip,
  )
  if (!captcha.ok) {
    return { ok: false, message: captcha.message }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return {
      ok: false,
      message:
        error.message === "Invalid login credentials"
          ? "Email ou senha incorretos."
          : error.message,
    }
  }

  revalidatePath("/", "layout")

  // Se a conta tem 2FA, a senha só entrega metade do login: manda direto pra
  // segunda etapa em vez de passar pelo dashboard e ser rebatido de volta.
  const { data: aal } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2") {
    redirect("/login/verificacao")
  }

  redirect("/inicio")
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath("/", "layout")
  redirect("/login")
}
