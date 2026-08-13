import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * O ÚNICO jeito de montar link de autenticação por e-mail neste projeto.
 *
 * ⚠️ NUNCA use `properties.action_link` do `generateLink`. Ele não funciona
 * aqui, e falha CALADO — o usuário vê "link inválido ou expirado" num link que
 * o Supabase acabou de emitir e que está perfeitamente válido.
 *
 * Por quê (medido em 13/ago/26, com o link cru no curl):
 *   1. `generateLink` devolve um link que redireciona no fluxo IMPLICIT — os
 *      tokens vêm no fragmento: `/redefinir-senha#access_token=...`
 *   2. `@supabase/ssr` fixa `flowType: "pkce"` no cliente do browser. É
 *      hardcoded, não dá pra passar opção (createBrowserClient.js:42).
 *   3. `@supabase/auth-js` compara os dois e desiste (GoTrueClient.js:3041):
 *
 *        case 'implicit':
 *          if (this.flowType === 'pkce')
 *            throw new AuthPKCEGrantCodeExchangeError('Not a valid PKCE flow url.')
 *
 *      O token é jogado fora, nenhuma sessão nasce, e a tela cai no estado de
 *      link inválido depois do timeout.
 *
 * Ou seja: recuperação de senha NUNCA funcionou pra ninguém, e os 3 lembretes
 * de "confirme seu cadastro" da régua mandavam botão morto. Ninguém reclamou
 * porque quem não consegue entrar não tem por onde reclamar.
 *
 * A saída é o `token_hash` + `verifyOtp` NO SERVIDOR (rota /auth/confirm), que
 * é o caminho que o Supabase documenta pra app com SSR. Ele não passa por
 * fluxo nenhum do browser, então a incompatibilidade acima deixa de existir.
 *
 * De quebra resolve outras duas coisas:
 *
 * - **O link fica no NOSSO domínio.** Antes o cliente recebia
 *   `srgmmqihgvkmwjkorkva.supabase.co/auth/v1/verify?token=...` — nome de
 *   servidor aleatório, num e-mail pedindo pra digitar senha. Cara de golpe.
 * - **Sobrevive a scanner de e-mail.** Gmail e Outlook (Safe Links) abrem os
 *   links da mensagem pra checar segurança. Como o `/auth/v1/verify` consome o
 *   token de uso único no GET, o scanner queimava o link antes da pessoa
 *   clicar. Em /auth/confirm o token só é gasto quando alguém aperta o botão.
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.deliveryos.food"

/** Tipos que o `verifyOtp` aceita por `token_hash` e que a gente usa. */
export type TipoLinkAuth = "recovery" | "magiclink" | "invite"

export async function linkDeAuth({
  tipo,
  email,
  next,
  site = SITE,
}: {
  tipo: TipoLinkAuth
  email: string
  /** Pra onde mandar depois de validar. Caminho relativo, começando com "/". */
  next: string
  /** Origem a usar no link. Serve pro localhost e pra preview da Vercel. */
  site?: string
}): Promise<string | null> {
  const { data, error } = await createAdminClient().auth.admin.generateLink({
    type: tipo,
    email,
  })
  if (error || !data?.properties?.hashed_token) {
    // Quem chama decide o que fazer. A tela de "esqueci a senha" engole de
    // propósito (não pode revelar se o e-mail existe); a régua registra falha.
    if (error) console.error(`linkDeAuth(${tipo}):`, error.message)
    return null
  }

  const p = new URLSearchParams({
    token_hash: data.properties.hashed_token,
    type: tipo,
    next,
  })
  return `${site}/auth/confirm?${p.toString()}`
}
