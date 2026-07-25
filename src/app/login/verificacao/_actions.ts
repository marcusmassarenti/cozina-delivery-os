"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { consumirCodigo } from "@/lib/auth/backup-codes"
import { clientIp, rateLimit } from "@/lib/security/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"
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

/**
 * Entrada de emergência: consome um código de recuperação.
 *
 * Ao acertar, o 2FA é DESATIVADO e a pessoa entra. É deliberado — ela está
 * nesta tela porque perdeu o aparelho, então manter o fator ativo apenas a
 * travaria de novo no próximo login. Em seguida ela cadastra o aparelho novo.
 */
export async function usarCodigoDeRecuperacao(
  _prev: DesafioState,
  formData: FormData,
): Promise<DesafioState> {
  const code = String(formData.get("code") ?? "").trim()
  if (code.replace(/[^a-zA-Z0-9]/g, "").length !== 8) {
    return { ok: false, error: "O código de recuperação tem 8 caracteres." }
  }

  // Mesmo teto do código do app — sem limite, 8 caracteres dariam pra varrer.
  const ip = await clientIp()
  if (!(await rateLimit(`recuperacao:${ip}`, 10, 5 * 60))) {
    return {
      ok: false,
      error: "Muitas tentativas. Espere alguns minutos e tente de novo.",
    }
  }

  const supabase = await createClient()
  const { data: u } = await supabase.auth.getUser()
  if (!u.user) return { ok: false, error: "Sessão expirada. Entre de novo." }

  const valeu = await consumirCodigo(u.user.id, code)
  if (!valeu) {
    return { ok: false, error: "Código de recuperação inválido ou já utilizado." }
  }

  // Remove os fatores pelo cliente admin: a sessão está em aal1 e não teria
  // permissão pra se desfazer do próprio 2FA.
  const admin = createAdminClient()
  const { data: alvo } = await admin.auth.admin.getUserById(u.user.id)
  for (const f of alvo?.user?.factors ?? []) {
    await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: u.user.id })
  }

  // Os códigos restantes ficam. Já valeu a pena: na 1ª versão apagávamos todos
  // aqui, então qualquer tropeço depois deste ponto deixava a pessoa sem
  // nenhuma segunda chance. Com o 2FA desligado eles são inofensivos (a tela
  // de recuperação só existe quando há fator), e o próximo cadastro os
  // substitui.

  // Encerra a sessão e manda entrar de novo, em vez de tentar seguir com a
  // sessão atual. Ela nasceu exigindo aal2 e o fator acabou de sumir — foi
  // exatamente essa ambiguidade que devolveu o usuário pra tela de código no
  // primeiro teste. Login limpo não tem essa dúvida.
  await supabase.auth.signOut()

  revalidatePath("/", "layout")
  redirect("/login?recuperado=1")
}
