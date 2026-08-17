"use server"

/**
 * O aceite eletrônico, do lado do servidor.
 *
 * ⚠️ ESTA É UMA AÇÃO PÚBLICA — não passa por `requireSuperadmin()`, porque quem
 * a executa é justamente alguém que não tem conta. O que a protege:
 *
 *   1. O token do link (24 bytes aleatórios) é a única forma de chegar aqui.
 *   2. O estado permitido é UM só: proposta `enviada`. Rascunho, cancelada,
 *      recusada e já-assinada são recusados no próprio UPDATE, pelo banco.
 *   3. Nada de valor vem do navegador: preço, escopo e textos saem do que está
 *      gravado; data, IP e hash são calculados aqui.
 *
 * O que o cliente manda são só os dados dele — e é bom que sejam dele mesmo:
 * declarar nome e CPF é parte do que identifica o signatário.
 */
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"

import {
  docValido,
  registrarAceite,
  registrarRecusa,
} from "@/lib/data/proposta-aceite"

export type EstadoAceite = { ok: boolean; erro?: string }

/**
 * O IP de quem clicou.
 *
 * `x-forwarded-for` vem da borda da Vercel e pode trazer uma cadeia
 * ("cliente, proxy1, proxy2") — o primeiro é o cliente. Em último caso fica
 * vazio: comprovante sem IP ainda vale (nome, CPF, data e hash continuam lá),
 * comprovante com IP errado é pior que nenhum.
 */
async function origem(): Promise<{ ip: string; ua: string }> {
  const h = await headers()
  const ff = h.get("x-forwarded-for") ?? ""
  return {
    ip: (ff.split(",")[0] ?? "").trim() || (h.get("x-real-ip") ?? ""),
    ua: h.get("user-agent") ?? "",
  }
}

export async function aceitarProposta(
  token: string,
  input: { nome: string; cpf: string; cargo: string; email: string },
): Promise<EstadoAceite> {
  const nome = input.nome.trim()
  const email = input.email.trim()

  if (nome.length < 5 || !nome.includes(" "))
    return { ok: false, erro: "Escreva seu nome completo." }
  if (!docValido(input.cpf))
    return { ok: false, erro: "CPF ou CNPJ inválido — confira os números." }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return { ok: false, erro: "E-mail inválido." }

  const { ip, ua } = await origem()
  const r = await registrarAceite({
    token,
    nome,
    cpf: input.cpf,
    cargo: input.cargo.trim(),
    email,
    ip,
    userAgent: ua,
  })
  if (!r.ok) return { ok: false, erro: r.erro }

  /**
   * O aviso pro Marcus sai DEPOIS de gravar e nunca derruba o aceite.
   *
   * O ato jurídico é o registro no banco; o e-mail é conveniência. Se o Resend
   * estiver fora, o cliente não pode ver "não deu" numa tela em que ele já
   * aceitou — e clicar de novo, e receber "já foi aceita".
   */
  try {
    const { avisarPropostaAceita } = await import("@/lib/email/proposta-aceita")
    await avisarPropostaAceita(token)
  } catch (e) {
    console.error("avisarPropostaAceita:", e)
  }

  revalidatePath(`/proposta/${token}`)
  revalidatePath("/propostas")
  return { ok: true }
}

export async function recusarProposta(
  token: string,
  motivo: string,
): Promise<EstadoAceite> {
  const r = await registrarRecusa(token, motivo.trim())
  if (!r.ok) return { ok: false, erro: r.erro }
  revalidatePath(`/proposta/${token}`)
  revalidatePath("/propostas")
  return { ok: true }
}
