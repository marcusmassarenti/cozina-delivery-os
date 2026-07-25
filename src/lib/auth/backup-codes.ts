/**
 * Códigos de recuperação do 2FA.
 *
 * São 8 códigos de uso único, gerados quando a pessoa ativa a verificação em
 * duas etapas. Servem para uma situação específica: perdeu o celular e não
 * consegue mais gerar o código de 6 dígitos.
 *
 * Guardamos só o HASH (ver migration 0116). O texto existe uma única vez, na
 * tela em que é mostrado — nem nós conseguimos recuperá-lo depois.
 */
import "server-only"

import { createHash, randomInt } from "node:crypto"

import { createAdminClient } from "@/lib/supabase/admin"

/** Quantos códigos são gerados por vez. */
export const QUANTIDADE = 8

/**
 * Alfabeto sem caracteres que se confundem à mão: fora I, L, O, U, 0 e 1.
 * A pessoa vai anotar isso num papel — "0" virando "O" custaria o acesso.
 */
const ALFABETO = "ABCDEFGHJKMNPQRSTVWXYZ23456789"

/** Um código no formato XXXX-XXXX (fácil de ler em voz alta e de digitar). */
function gerarUm(): string {
  let s = ""
  for (let i = 0; i < 8; i++) {
    // randomInt do node é criptograficamente seguro — Math.random não é.
    s += ALFABETO[randomInt(ALFABETO.length)]
  }
  return `${s.slice(0, 4)}-${s.slice(4)}`
}

/** Tira hífen, espaço e caixa: "k7m2 9xqf" e "K7M2-9XQF" viram o mesmo. */
function normalizar(code: string): string {
  return code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
}

/** O user_id entra no hash pra o mesmo código gerar hashes diferentes por conta. */
function hash(userId: string, code: string): string {
  return createHash("sha256")
    .update(`${userId}:${normalizar(code)}`)
    .digest("hex")
}

/**
 * Gera um conjunto novo e substitui o anterior.
 *
 * Substituir (em vez de somar) é intencional: quem pede códigos novos
 * normalmente é porque perdeu ou desconfia dos antigos — deixá-los válidos
 * manteria vivo justamente o segredo que a pessoa quis invalidar.
 *
 * Devolve os códigos em TEXTO. É a única vez que eles existem assim.
 */
export async function gerarCodigos(userId: string): Promise<string[]> {
  const admin = createAdminClient()
  const codigos = Array.from({ length: QUANTIDADE }, gerarUm)

  await admin.from("mfa_backup_codes").delete().eq("user_id", userId)

  const { error } = await admin.from("mfa_backup_codes").insert(
    codigos.map((c) => ({ user_id: userId, code_hash: hash(userId, c) })),
  )
  if (error) throw new Error(`Falha ao gerar códigos: ${error.message}`)

  return codigos
}

/**
 * Consome um código, se existir e ainda não tiver sido usado.
 *
 * A checagem e a marcação acontecem no MESMO update condicional — assim dois
 * envios simultâneos do mesmo código não passam os dois (o segundo não acha
 * mais a linha com `used_at is null`).
 */
export async function consumirCodigo(
  userId: string,
  code: string,
): Promise<boolean> {
  if (normalizar(code).length !== 8) return false

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("mfa_backup_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("code_hash", hash(userId, code))
    .is("used_at", null)
    .select("id")

  if (error) return false
  return (data ?? []).length > 0
}

/** Quantos códigos ainda podem ser usados. */
export async function contarDisponiveis(userId: string): Promise<number> {
  const admin = createAdminClient()
  const { count } = await admin
    .from("mfa_backup_codes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("used_at", null)
  return count ?? 0
}

/** Limpa tudo — usado quando o 2FA é desativado. */
export async function apagarCodigos(userId: string): Promise<void> {
  const admin = createAdminClient()
  await admin.from("mfa_backup_codes").delete().eq("user_id", userId)
}
