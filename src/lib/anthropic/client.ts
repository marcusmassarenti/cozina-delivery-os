import "server-only"

/**
 * Client mínimo da Messages API do Claude (Anthropic), via fetch — sem SDK,
 * no mesmo espírito do client do iFood. Usado pra gerar o plano de ação do
 * Diagnóstico.
 *
 * Env:
 *   ANTHROPIC_API_KEY        — obrigatória (console.anthropic.com)
 *   DIAGNOSTICO_IA_MODEL     — opcional (default claude-sonnet-5)
 */

const API_URL = "https://api.anthropic.com/v1/messages"
// Haiku: ~5x mais barato que o Sonnet e suficiente pra tarefa estruturada.
// Trocável por claude-sonnet-5 (mais afiado, mais caro) via env.
const DEFAULT_MODEL = "claude-haiku-4-5-20251001"

export function isAnthropicConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

export function diagnosticoModel(): string {
  return process.env.DIAGNOSTICO_IA_MODEL || DEFAULT_MODEL
}

export class AnthropicError extends Error {}

type AskOpts = {
  system: string
  user: string
  maxTokens?: number
  model?: string
}

/** Chama o Claude e devolve o texto da resposta. */
export async function askClaude(opts: AskOpts): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new AnthropicError("ANTHROPIC_API_KEY não configurada.")

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      // Nota: os modelos novos (sonnet-5/opus) usam "thinking" e não aceitam
      // `temperature`. O max_tokens precisa cobrir raciocínio + resposta.
      model: opts.model || diagnosticoModel(),
      max_tokens: opts.maxTokens ?? 5000,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new AnthropicError(
      `Claude respondeu ${res.status}: ${body.slice(0, 300)}`,
    )
  }

  const json = (await res.json()) as {
    content?: { type: string; text?: string }[]
  }
  const text = json.content?.find((c) => c.type === "text")?.text
  if (!text) throw new AnthropicError("Resposta do Claude sem texto.")
  return text
}

export type ChatTurn = { role: "user" | "assistant"; content: string }

/**
 * Chama o Claude num CHAT multi-turno: o `system` carrega o contexto fixo
 * (os números da loja) e `messages` é o histórico da conversa. Usado pelo
 * Consultor IA, onde uma pergunta de acompanhamento ("e a segunda?") precisa
 * do que já foi dito.
 */
export async function askClaudeChat(opts: {
  system: string
  messages: ChatTurn[]
  maxTokens?: number
  model?: string
}): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new AnthropicError("ANTHROPIC_API_KEY não configurada.")

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model || diagnosticoModel(),
      max_tokens: opts.maxTokens ?? 1200,
      system: opts.system,
      messages: opts.messages,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new AnthropicError(
      `Claude respondeu ${res.status}: ${body.slice(0, 300)}`,
    )
  }

  const json = (await res.json()) as {
    content?: { type: string; text?: string }[]
  }
  const text = json.content?.find((c) => c.type === "text")?.text
  if (!text) throw new AnthropicError("Resposta do Claude sem texto.")
  return text
}

/** Chama o Claude pedindo JSON e faz o parse (tolera cercas ```json). */
export async function askClaudeJson<T>(opts: AskOpts): Promise<T> {
  const raw = await askClaude(opts)
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
  // Pega do primeiro { ao último } (defensivo contra texto antes/depois).
  const start = cleaned.indexOf("{")
  const end = cleaned.lastIndexOf("}")
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned
  try {
    return JSON.parse(slice) as T
  } catch {
    throw new AnthropicError("Não consegui interpretar o JSON do Claude.")
  }
}
