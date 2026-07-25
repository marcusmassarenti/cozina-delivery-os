/**
 * Cloudflare Turnstile — prova de que existe um navegador real no login.
 *
 * POR QUE, se já há rate-limit: o rate-limit é POR IP (10 tentativas / 5 min).
 * Ele segura força bruta de uma origem só, mas não segura credential stuffing
 * distribuído — botnet com mil IPs faz 10 tentativas em cada e passa reto. O
 * Turnstile ataca outra camada: valida o navegador, não o endereço.
 *
 * Escolhido no lugar do reCAPTCHA por ser gratuito, quase sempre invisível
 * (sem "clique nos semáforos") e por não perfilar o usuário.
 *
 * DEGRADA COM ELEGÂNCIA: sem `TURNSTILE_SECRET_KEY` configurada, `verificar`
 * devolve ok e o login segue funcionando só com o rate-limit. Isso evita que
 * uma variável faltando na Vercel derrube o acesso de todo mundo — a lição do
 * episódio da env "presa" do iFood.
 *
 * Config (Marcus): dash.cloudflare.com → Turnstile → criar site.
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY  (pública, vai no HTML)
 *   TURNSTILE_SECRET_KEY            (segredo — .env.local + Vercel)
 */
import "server-only"

const VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify"

export type TurnstileResultado = {
  ok: boolean
  /** Mensagem pronta pra mostrar ao usuário (só quando !ok). */
  message?: string
  /** true quando o Turnstile não está configurado — seguimos sem ele. */
  desligado?: boolean
}

/** O Turnstile só age quando as DUAS chaves estão configuradas. */
export function turnstileAtivo(): boolean {
  return (
    !!process.env.TURNSTILE_SECRET_KEY?.trim() &&
    !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()
  )
}

/**
 * Valida o token que o widget gerou no navegador. O token é de uso único e
 * expira em ~5 min — por isso a verificação acontece no submit, não antes.
 */
export async function verificarTurnstile(
  token: string | null | undefined,
  ip?: string,
): Promise<TurnstileResultado> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim()
  if (!secret || !turnstileAtivo()) return { ok: true, desligado: true }

  if (!token) {
    return {
      ok: false,
      message: "Confirme que você não é um robô e tente de novo.",
    }
  }

  try {
    const body = new URLSearchParams({ secret, response: token })
    // O IP é opcional pro Cloudflare, mas melhora a análise de risco.
    if (ip && ip !== "desconhecido") body.set("remoteip", ip)

    const r = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    })
    const j = (await r.json()) as {
      success?: boolean
      "error-codes"?: string[]
    }
    if (j.success) return { ok: true }

    const codes = j["error-codes"] ?? []
    // Token já usado/expirado é o caso comum de "tentou de novo na mesma tela".
    const expirou =
      codes.includes("timeout-or-duplicate") ||
      codes.includes("invalid-input-response")
    return {
      ok: false,
      message: expirou
        ? "A verificação expirou. Tente entrar de novo."
        : "Não foi possível confirmar que você é humano. Recarregue a página.",
    }
  } catch {
    // Cloudflare fora do ar não pode trancar o cliente pra fora do sistema.
    // O rate-limit por IP continua valendo como rede de segurança.
    console.error("turnstile: verificação indisponível — liberando com rate-limit")
    return { ok: true, desligado: true }
  }
}
