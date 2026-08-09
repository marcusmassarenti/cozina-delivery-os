"use server"

import { headers } from "next/headers"

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

  // O e-mail sai pelo NOSSO layout, não pelo template do Supabase.
  //
  // O deles chegava em inglês ("Reset your password"), sem logo e sem marca
  // nenhuma — parecendo phishing justamente no e-mail em que a pessoa vai
  // digitar uma senha nova. Aqui a gente gera o link com `generateLink` e
  // manda pelo mesmo caminho dos outros avisos; a régua já fazia isso com o
  // magic link.
  //
  // NUNCA MUDA A RESPOSTA. Toda falha daqui pra frente é engolida de
  // propósito: "não achei esse e-mail", "o Resend recusou", qualquer coisa.
  // A tela responde "enviado" mesmo pra e-mail que não existe, e é isso que
  // impede alguém de descobrir quem tem conta testando endereços. Um erro
  // diferente aqui entregaria a resposta pelo tempo ou pela mensagem.
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin")
    const { recuperarSenha } = await import("@/lib/email/templates")
    const { enviarEmail } = await import("@/lib/email/enviar")

    const { data: g } = await createAdminClient().auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    })
    const link = g?.properties?.action_link
    if (link) {
      const { assunto, html } = recuperarSenha({ link })
      await enviarEmail({
        holdingId: null,
        tipo: "recuperar-senha",
        para: email,
        assunto,
        html,
        // Pedir de novo é normal (o link expira em 1h). Recusar o segundo
        // pedido trancaria a pessoa do lado de fora.
        forcar: true,
      })
    }
  } catch (e) {
    console.error("requestReset:", e)
  }

  return { ok: true, sent: true }
}
