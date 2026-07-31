"use client"

import Script from "next/script"

declare global {
  interface Window {
    turnstile?: { reset: (widget?: string) => void }
  }
}

/**
 * Descarta o token atual e pede um novo à Cloudflare.
 *
 * O token do Turnstile é de USO ÚNICO: assim que o servidor o valida, a
 * Cloudflare o queima. Como aqui a renderização é implícita, o script não sabe
 * que houve um submit — o token gasto fica parado no input escondido e vai de
 * novo no próximo envio, onde é recusado.
 *
 * O estrago aparecia em quem errava a senha: a 1ª tentativa dava "Email ou
 * senha incorretos" (certo), e a 2ª — mesmo com a senha CORRETA — dava
 * "A verificação expirou. Tente entrar de novo.". A pessoa ficava presa, e a
 * única saída era recarregar a página, que ninguém adivinha. Reproduzido em
 * 30/jul/26 comparando o token antes e depois: vinha idêntico.
 *
 * `?.` porque o script pode não ter carregado ainda, e porque sem site key o
 * widget nem renderiza — nos dois casos não há nada a resetar.
 */
export function resetTurnstile() {
  window.turnstile?.reset()
}

/**
 * Widget do Cloudflare Turnstile.
 *
 * Usa a renderização IMPLÍCITA (classe `cf-turnstile`): o script do Cloudflare
 * acha o elemento sozinho e injeta o input escondido `cf-turnstile-response`,
 * que o `<form action={serverAction}>` manda junto no submit — sem precisar de
 * estado no React.
 *
 * Não renderiza nada se a chave pública não estiver configurada, então o login
 * continua funcionando (só com o rate-limit por IP) enquanto o Turnstile não
 * for provisionado.
 */
export function TurnstileWidget() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()
  if (!siteKey) return null

  return (
    <>
      {/* afterInteractive, não lazyOnload: com lazyOnload o script só carrega
          depois de todos os recursos da página, e quem digita rápido clica em
          Entrar antes de existir token — levando um "confirme que não é um
          robô" sem ter feito nada errado. */}
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
      />
      <div
        className="cf-turnstile"
        data-sitekey={siteKey}
        // Acompanha o tema claro/escuro do painel.
        data-theme="auto"
        // "flexible" deixa o widget ocupar a largura do formulário.
        data-size="flexible"
      />
    </>
  )
}
