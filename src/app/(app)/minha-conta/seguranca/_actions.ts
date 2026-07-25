"use server"

import { revalidatePath } from "next/cache"

import { apagarCodigos, gerarCodigos } from "@/lib/auth/backup-codes"
import { createClient } from "@/lib/supabase/server"

export type EnrollState = {
  ok: boolean
  /** SVG do QR Code (data URI) pra escanear no app autenticador. */
  qrCode?: string
  /** Mesma chave em texto, pra quem prefere digitar. */
  secret?: string
  factorId?: string
  error?: string
}

/**
 * Passo 1: cria o fator TOTP e devolve o QR Code.
 *
 * O fator nasce "unverified" — só passa a valer depois que a pessoa digita o
 * primeiro código (confirmarFator). Enquanto isso, nada muda no login.
 */
export async function iniciarCadastro2FA(
  _prev: EnrollState,
  _formData: FormData,
): Promise<EnrollState> {
  const supabase = await createClient()

  // Limpa tentativas anteriores não confirmadas — sem isso, o Supabase recusa
  // por nome duplicado e a pessoa fica presa sem entender o motivo.
  const { data: fatores } = await supabase.auth.mfa.listFactors()
  for (const f of fatores?.all ?? []) {
    if (f.status !== "verified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id })
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Delivery OS",
  })
  if (error) return { ok: false, error: traduzir(error.message) }

  return {
    ok: true,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    factorId: data.id,
  }
}

export type VerifyState = {
  ok: boolean
  message?: string
  error?: string
  /** Códigos de recuperação — só vêm preenchidos na hora em que são gerados. */
  codigos?: string[]
}

/**
 * Passo 2: confirma o fator com o primeiro código de 6 dígitos.
 * A partir daqui, o login desta conta passa a exigir o app autenticador.
 */
export async function confirmarFator2FA(
  _prev: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const factorId = String(formData.get("factorId") ?? "").trim()
  const code = somenteDigitos(String(formData.get("code") ?? ""))
  if (!factorId) return { ok: false, error: "Recomece o cadastro do 2FA." }
  if (code.length !== 6) {
    return { ok: false, error: "Digite os 6 dígitos do aplicativo." }
  }

  const supabase = await createClient()
  const { data: desafio, error: errDesafio } =
    await supabase.auth.mfa.challenge({ factorId })
  if (errDesafio) return { ok: false, error: traduzir(errDesafio.message) }

  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: desafio.id,
    code,
  })
  if (error) return { ok: false, error: traduzir(error.message) }

  // Gera os códigos de recuperação JUNTO com a ativação: é o único momento em
  // que a pessoa ainda tem o aparelho em mãos e está com o assunto na cabeça.
  const { data: u } = await supabase.auth.getUser()
  const codigos = u.user ? await gerarCodigos(u.user.id) : []

  revalidatePath("/minha-conta/seguranca")
  return { ok: true, message: "Verificação em duas etapas ativada.", codigos }
}

/**
 * Gera um conjunto novo de códigos, invalidando os anteriores.
 *
 * Exige um código do app pelo mesmo motivo que desativar exige: sem isso,
 * quem encontrasse uma sessão aberta imprimiria 8 chaves permanentes da conta.
 */
export async function regerarCodigos(
  _prev: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const factorId = String(formData.get("factorId") ?? "").trim()
  const code = somenteDigitos(String(formData.get("code") ?? ""))
  if (!factorId) return { ok: false, error: "Fator não encontrado." }
  if (code.length !== 6) {
    return { ok: false, error: "Digite os 6 dígitos do aplicativo." }
  }

  const supabase = await createClient()
  const { data: desafio, error: errDesafio } =
    await supabase.auth.mfa.challenge({ factorId })
  if (errDesafio) return { ok: false, error: traduzir(errDesafio.message) }

  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: desafio.id,
    code,
  })
  if (error) return { ok: false, error: traduzir(error.message) }

  const { data: u } = await supabase.auth.getUser()
  if (!u.user) return { ok: false, error: "Sessão expirada." }
  const codigos = await gerarCodigos(u.user.id)

  revalidatePath("/minha-conta/seguranca")
  return {
    ok: true,
    message: "Códigos novos gerados. Os anteriores não valem mais.",
    codigos,
  }
}

/**
 * Desliga o 2FA da conta.
 *
 * Exige um código válido: sem isso, quem sentasse num computador com a sessão
 * aberta desativaria a proteção com um clique — o que anularia o 2FA.
 */
export async function desativar2FA(
  _prev: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const factorId = String(formData.get("factorId") ?? "").trim()
  const code = somenteDigitos(String(formData.get("code") ?? ""))
  if (!factorId) return { ok: false, error: "Fator não encontrado." }
  if (code.length !== 6) {
    return { ok: false, error: "Digite os 6 dígitos para confirmar." }
  }

  const supabase = await createClient()
  const { data: desafio, error: errDesafio } =
    await supabase.auth.mfa.challenge({ factorId })
  if (errDesafio) return { ok: false, error: traduzir(errDesafio.message) }

  const { error: errVerify } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: desafio.id,
    code,
  })
  if (errVerify) return { ok: false, error: traduzir(errVerify.message) }

  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) return { ok: false, error: traduzir(error.message) }

  // Sem 2FA, código de recuperação não recupera nada — deixá-los vivos só
  // manteria segredos válidos circulando por aí.
  const { data: u } = await supabase.auth.getUser()
  if (u.user) await apagarCodigos(u.user.id)

  revalidatePath("/minha-conta/seguranca")
  return { ok: true, message: "Verificação em duas etapas desativada." }
}

function somenteDigitos(s: string): string {
  return s.replace(/\D/g, "")
}

/** Mensagens do Supabase (em inglês) → português, sem jargão. */
function traduzir(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes("invalid totp code") || m.includes("invalid code")) {
    return "Código incorreto. Confira o app e tente de novo — ele muda a cada 30 segundos."
  }
  if (m.includes("expired")) {
    return "O código expirou. Digite o que está aparecendo agora no app."
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Muitas tentativas seguidas. Espere um instante e tente de novo."
  }
  if (m.includes("already exists") || m.includes("friendly name")) {
    return "Já existe um cadastro em andamento. Recarregue a página e recomece."
  }
  return "Não foi possível concluir. Tente de novo."
}
