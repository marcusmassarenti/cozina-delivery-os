"use server"

import { headers } from "next/headers"

import { createClient } from "@/lib/supabase/server"
import { clientIp, rateLimit } from "@/lib/security/rate-limit"

export type ResetState = { ok: boolean; message?: string; sent?: boolean }

/**
 * Dispara o e-mail de recuperação de senha. Por privacidade, SEMPRE responde
 * "enviado" — não revela se o e-mail existe na base.
 */
export async function requestReset(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  if (!email || !email.includes("@")) {
    return { ok: false, message: "Informe um e-mail válido." }
  }

  // Anti-abuso: 5 pedidos / 15 min por IP (evita flood de e-mail).
  const ip = await clientIp()
  if (!(await rateLimit(`reset:${ip}`, 5, 15 * 60))) {
    // Resposta genérica (não revela nada) — só não dispara mais e-mail.
    return { ok: true, sent: true }
  }

  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto =
    h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https")
  const redirectTo = `${proto}://${host}/redefinir-senha`

  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(email, { redirectTo })

  return { ok: true, sent: true }
}
