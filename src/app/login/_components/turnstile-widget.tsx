"use client"

import Script from "next/script"

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
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="lazyOnload"
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
