"use server"

import { redirect } from "next/navigation"
import type { EmailOtpType } from "@supabase/supabase-js"

import { createClient } from "@/lib/supabase/server"

export type ConfirmState = { ok: boolean; message?: string }

/**
 * Confirma o e-mail via token_hash (verifyOtp) — disparado por um CLIQUE do
 * usuário, não pelo carregamento do link. Assim o scanner de e-mail (Safe
 * Links etc.) não consome o token de uso único ao pré-visualizar o link.
 */
export async function confirmEmail(
  _prev: ConfirmState,
  formData: FormData,
): Promise<ConfirmState> {
  const tokenHash = String(formData.get("token_hash") ?? "")
  const rawType = String(formData.get("type") ?? "signup")
  const type: EmailOtpType = (
    ["signup", "email", "recovery", "invite", "email_change", "magiclink"].includes(
      rawType,
    )
      ? rawType
      : "email"
  ) as EmailOtpType

  if (!tokenHash) return { ok: false, message: "Link inválido." }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
  if (error) {
    return {
      ok: false,
      message:
        "Este link não é mais válido (pode ter expirado ou já sido usado). Peça um novo e-mail de confirmação.",
    }
  }
  redirect("/")
}
