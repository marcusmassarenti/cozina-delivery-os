"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { getMfaStatus } from "@/lib/auth/mfa"
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
  //
  // Passa por `getMfaStatus` em vez de olhar o aal cru: é lá que mora a
  // exceção do aparelho confiável. Repetir a regra aqui faria as duas portas
  // (esta e a do layout) discordarem — e quem manda seria a mais burra.
  // Pra onde ir depois. Só caminho INTERNO: `next` vem da URL, e aceitar
  // qualquer valor viraria redirect aberto — bastaria mandar
  // /login?next=https://site-falso.com pra usar nosso domínio como trampolim
  // numa fraude. Barramos "//" também, que o navegador lê como outro host.
  const bruto = String(formData.get("next") ?? "")
  const destino =
    bruto.startsWith("/") && !bruto.startsWith("//") ? bruto : "/inicio"

  const { precisaVerificar } = await getMfaStatus()
  if (precisaVerificar) {
    // O destino atravessa a segunda etapa, senão o 2FA come a intenção.
    redirect(
      destino === "/inicio"
        ? "/login/verificacao"
        : `/login/verificacao?next=${encodeURIComponent(destino)}`,
    )
  }

  redirect(destino)
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath("/", "layout")
  redirect("/login")
}
