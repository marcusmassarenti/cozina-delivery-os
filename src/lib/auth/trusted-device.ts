/**
 * "Não pedir o código de novo neste aparelho por 15 dias."
 *
 * O 2FA nativo do Supabase é por SESSÃO: assim que a pessoa sai (ou a sessão
 * expira), o próximo login volta a exigir os 6 dígitos. Para quem entra várias
 * vezes por dia no próprio computador isso vira pedágio, e pedágio demais faz
 * gente desligar o 2FA — que é o pior desfecho possível.
 *
 * A confiança mora num cookie ASSINADO. Ele não guarda permissão nenhuma: só
 * afirma "este navegador já provou o fator Y, e isso vale até a data Z". Quem
 * manda continua sendo o servidor, que recalcula a assinatura antes de
 * acreditar.
 *
 * Amarrado ao `factorId` e não ao `userId`: um fator pertence a exatamente um
 * usuário, então o factorId já identifica a pessoa. Guardar os dois custaria
 * uma ida ao `getUser()` do Supabase EM TODA PÁGINA (o `getMfaStatus` roda no
 * layout que envolve o app inteiro) sem apertar nada — o navegador de outra
 * pessoa teria outro factorId e cairia fora do mesmo jeito.
 *
 * ⚠️ O QUE ISSO CUSTA (decisão do Marcus, 30/jul/26): por 15 dias, quem tiver
 * ESTE computador **e** a senha entra sem o segundo fator. É o mesmo trade-off
 * do "lembrar deste dispositivo" do Google e do GitHub. Foi escolhido o modo
 * automático — sem caixinha pra marcar —, então nem existe a opção de recusar
 * num computador emprestado. Em máquina compartilhada, use janela anônima.
 *
 * SOBREVIVE AO LOGOUT DE PROPÓSITO. Era exatamente essa a dor: "toda vez que
 * desloga preciso colocar de novo". Se `signOut` limpasse o cookie, o recurso
 * não serviria pra nada.
 *
 * SE AUTODESTRÓI quando o 2FA muda: a assinatura inclui o `factorId`. Trocou de
 * aparelho autenticador (ou usou código de recuperação, que apaga os fatores),
 * o id muda e o cookie antigo deixa de bater sozinho — sem precisar de faxina
 * espalhada pelo código.
 */
import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"

const COOKIE = "aparelho_confiavel"
const DIAS = 15
const VALIDADE_MS = DIAS * 24 * 60 * 60 * 1000

/**
 * Chave da assinatura, derivada do service role.
 *
 * Não criamos variável de ambiente nova porque toda env nova é mais um passo
 * manual na Vercel — e passo manual esquecido já travou coisa aqui antes. O
 * rótulo no meio garante SEPARAÇÃO DE DOMÍNIO: a chave que assina estes
 * cookies não é o service role em si, é um derivado dele que não serve pra
 * mais nada.
 */
function chave(): Buffer | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) return null
  return createHmac("sha256", secret)
    .update("delivery-os/aparelho-confiavel/v1")
    .digest()
}

function assinar(payload: string, k: Buffer): string {
  return createHmac("sha256", k).update(payload).digest("base64url")
}

/**
 * Grava a confiança neste navegador. Só pode ser chamada de Server Action /
 * Route Handler — Server Component não escreve cookie.
 */
export async function confiarNesteAparelho(factorId: string) {
  const k = chave()
  if (!k) return // sem segredo, o recurso simplesmente não existe

  const expira = Date.now() + VALIDADE_MS
  const payload = `${factorId}.${expira}`
  const valor = `${Buffer.from(payload).toString("base64url")}.${assinar(payload, k)}`

  const jar = await cookies()
  jar.set(COOKIE, valor, {
    httpOnly: true, // JS da página não lê: fecha a porta pra XSS roubar
    secure: process.env.NODE_ENV === "production", // em localhost não há https
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(VALIDADE_MS / 1000),
  })
}

/**
 * Este navegador já provou o segundo fator deste usuário?
 *
 * Só LÊ cookie, então pode ser chamada de Server Component (é o caso do
 * `getMfaStatus`, que roda no layout).
 */
export async function aparelhoConfiavel(factorId: string): Promise<boolean> {
  const k = chave()
  if (!k) return false

  const bruto = (await cookies()).get(COOKIE)?.value
  if (!bruto) return false

  const [corpo, assinatura] = bruto.split(".")
  if (!corpo || !assinatura) return false

  let payload: string
  try {
    payload = Buffer.from(corpo, "base64url").toString()
  } catch {
    return false
  }

  // Compara em tempo constante: comparação normal vazaria, byte a byte, o
  // quanto um palpite chegou perto da assinatura correta.
  const esperada = Buffer.from(assinar(payload, k))
  const recebida = Buffer.from(assinatura)
  if (esperada.length !== recebida.length) return false
  if (!timingSafeEqual(esperada, recebida)) return false

  // Só depois de a assinatura bater é que o conteúdo pode ser levado a sério.
  const [fid, expira] = payload.split(".")
  if (fid !== factorId) return false
  return Number(expira) > Date.now()
}
