"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { clientIp, rateLimit } from "@/lib/security/rate-limit"
import { createClient } from "@/lib/supabase/server"

export type DesafioState = {
  ok: boolean
  error?: string
}

/**
 * Segunda etapa do login: valida o código do app autenticador e eleva a sessão
 * para aal2, liberando o app.
 */
export async function verificarCodigo2FA(
  _prev: DesafioState,
  formData: FormData,
): Promise<DesafioState> {
  const code = String(formData.get("code") ?? "").replace(/\D/g, "")
  if (code.length !== 6) {
    return { ok: false, error: "Digite os 6 dígitos do aplicativo." }
  }

  // Sem isso, o segundo fator viraria um PIN de 6 dígitos aberto a força
  // bruta: um milhão de combinações é pouco pra quem já tem a senha.
  const ip = await clientIp()
  if (!(await rateLimit(`mfa:${ip}`, 10, 5 * 60))) {
    return {
      ok: false,
      error: "Muitas tentativas. Espere alguns minutos e tente de novo.",
    }
  }

  const supabase = await createClient()
  const { data: fatores, error: errFatores } =
    await supabase.auth.mfa.listFactors()
  if (errFatores) return { ok: false, error: "Sessão expirada. Entre de novo." }

  const factorId = fatores?.totp?.[0]?.id
  if (!factorId) {
    return { ok: false, error: "Nenhum aplicativo autenticador cadastrado." }
  }

  const { data: desafio, error: errDesafio } =
    await supabase.auth.mfa.challenge({ factorId })
  if (errDesafio) {
    return { ok: false, error: "Não foi possível verificar agora. Tente de novo." }
  }

  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: desafio.id,
    code,
  })
  if (error) {
    const m = error.message.toLowerCase()
    return {
      ok: false,
      error:
        m.includes("expired") || m.includes("invalid")
          ? "Código incorreto ou expirado. O app gera um novo a cada 30 segundos."
          : "Não foi possível verificar. Tente de novo.",
    }
  }

  revalidatePath("/", "layout")
  redirect("/")
}
