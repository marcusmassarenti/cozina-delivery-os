"use server"

import { redirect } from "next/navigation"
import type { EmailOtpType } from "@supabase/supabase-js"

import { createClient } from "@/lib/supabase/server"

export type ConfirmState = { ok: boolean; message?: string }

const TIPOS = [
  "signup",
  "email",
  "recovery",
  "invite",
  "email_change",
  "magiclink",
] as const

/**
 * Só caminho relativo dentro do site. Sem isso, `?next=` vira redirect aberto:
 * bastaria mandar `/auth/confirm?...&next=https://sitefalso` pra alguém sair
 * daqui já logado direto num domínio de terceiro.
 */
function destinoSeguro(next: string | null): string {
  if (!next || !next.startsWith("/")) return "/inicio"
  if (next.startsWith("//")) return "/inicio" // "//host" é URL absoluta
  return next
}

/**
 * Valida o link de e-mail via token_hash (verifyOtp) — disparado por um CLIQUE
 * do usuário, não pelo carregamento do link. Assim o scanner de e-mail (Safe
 * Links etc.) não consome o token de uso único ao pré-visualizar o link.
 *
 * Serve os quatro caminhos: confirmação de cadastro, recuperação de senha,
 * convite e magic link. Ver o porquê em `@/lib/auth/link-email`.
 */
export async function confirmEmail(
  _prev: ConfirmState,
  formData: FormData,
): Promise<ConfirmState> {
  const tokenHash = String(formData.get("token_hash") ?? "")
  const rawType = String(formData.get("type") ?? "signup")
  const type: EmailOtpType = (
    (TIPOS as readonly string[]).includes(rawType) ? rawType : "email"
  ) as EmailOtpType
  const destino = destinoSeguro(formData.get("next")?.toString() ?? null)

  if (!tokenHash) return { ok: false, message: "Link inválido." }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
  if (error) {
    return {
      ok: false,
      message:
        "Este link não é mais válido (pode ter expirado ou já sido usado). Peça um novo e-mail.",
    }
  }
  redirect(destino)
}
