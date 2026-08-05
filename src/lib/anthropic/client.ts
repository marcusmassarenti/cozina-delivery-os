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
 * Bloco do `system`. Marcar `cache: true` liga o PROMPT CACHING naquele ponto:
 * a Anthropic guarda o prefixo do prompt e, numa próxima chamada com o MESMO
 * início (byte a byte), cobra 10% em vez de 100% por aqueles tokens.
 *
 * O preço disso é que a GRAVAÇÃO custa 25% a mais e o cache expira em ~5 min.
 * Ou seja: compensa quando a pessoa faz perguntas em sequência (o normal numa
 * conversa) e sai levemente mais caro na pergunta solta.
 *
 * Ordem importa: o cache casa por PREFIXO. Por isso o bloco fixo (regras +
 * manual, igual pra todos os clientes) vem antes do contexto (números da conta,
 * que mudam por cliente) — assim o pedaço fixo é reaproveitado entre clientes.
 */
export type SystemBloco = { text: string; cache?: boolean }

/** `system` vira string simples ou lista de blocos (com marcação de cache). */
function systemPayload(system: string | SystemBloco[]) {
  if (typeof system === "string") return system
  return system.map((b) => ({
    type: "text",
    text: b.text,
    ...(b.cache ? { cache_control: { type: "ephemeral" } } : {}),
  }))
}

/**
 * Consumo de UMA resposta da IA — base pro custo por cliente.
 * A API devolve isso em `usage`; a gente só descartava. Acumula entre as
 * iterações do loop de busca web (stop_reason "pause_turn").
 */
export type UsoIa = {
  modelo: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  webSearches: number
}

type UsageApi = {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  server_tool_use?: { web_search_requests?: number }
}

function usoVazio(modelo: string): UsoIa {
  return {
    modelo,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    webSearches: 0,
  }
}

/** Soma o `usage` de uma resposta no acumulador. */
function somarUso(acc: UsoIa, u: UsageApi | undefined | null): void {
  if (!u) return
  acc.inputTokens += u.input_tokens ?? 0
  acc.outputTokens += u.output_tokens ?? 0
  acc.cacheReadTokens += u.cache_read_input_tokens ?? 0
  acc.cacheWriteTokens += u.cache_creation_input_tokens ?? 0
  acc.webSearches += u.server_tool_use?.web_search_requests ?? 0
}

/**
 * Chama o Claude num CHAT multi-turno: o `system` carrega o contexto fixo
 * (os números da loja) e `messages` é o histórico da conversa. Usado pelo
 * Consultor IA, onde uma pergunta de acompanhamento ("e a segunda?") precisa
 * do que já foi dito.
 */
export async function askClaudeChat(opts: {
  system: string | SystemBloco[]
  messages: ChatTurn[]
  maxTokens?: number
  model?: string
  /**
   * Liga a busca na web (server-side). Deixa o Nino pesquisar dados EXTERNOS
   * (mercado, concorrência, tendências do setor) que não estão nos números da
   * conta. O modelo só pesquisa quando a pergunta pede — perguntas sobre os
   * próprios números não disparam busca. Haiku usa a versão básica
   * `web_search_20250305` (a `_20260209` é só de Opus/Sonnet).
   */
  webSearch?: boolean
  /** Ferramentas que o modelo pode chamar (executadas aqui no servidor). */
  ferramentas?: FerramentaIa[]
  /** Recebe o consumo (tokens/buscas) pra quem chamou registrar o custo. */
  onUso?: (uso: UsoIa) => void
}): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new AnthropicError("ANTHROPIC_API_KEY não configurada.")
  const modelo = opts.model || diagnosticoModel()
  const uso = usoVazio(modelo)

  // Histórico no formato da API. Se a busca web pausar (stop_reason
  // "pause_turn", quando bate o limite de iterações do loop server-side), a
  // gente empilha o que o assistente já produziu e reenvia pra continuar.
  const apiMessages: { role: string; content: unknown }[] = opts.messages.map(
    (m) => ({ role: m.role, content: m.content }),
  )
  const ferramentas = opts.ferramentas ?? []
  const toolList = [
    ...(opts.webSearch
      ? [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }]
      : []),
    ...ferramentas.map((f) => ({
      name: f.name,
      description: f.description,
      input_schema: f.input_schema,
    })),
  ]
  const tools = toolList.length ? toolList : undefined

  const textos: string[] = []
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model || diagnosticoModel(),
        max_tokens: opts.maxTokens ?? (opts.webSearch ? 1500 : 1200),
        system: systemPayload(opts.system),
        messages: apiMessages,
        ...(tools ? { tools } : {}),
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new AnthropicError(
        `Claude respondeu ${res.status}: ${body.slice(0, 300)}`,
      )
    }

    const json = (await res.json()) as {
      content?: {
        type: string
        text?: string
        id?: string
        name?: string
        input?: Record<string, unknown>
      }[]
      stop_reason?: string
      usage?: UsageApi
    }
    somarUso(uso, json.usage)
    const blocks = json.content ?? []
    // Com busca web a resposta vem em VÁRIOS blocos de texto (antes e depois da
    // pesquisa) — junta todos, não só o primeiro.
    for (const b of blocks) {
      if (b.type === "text" && b.text) textos.push(b.text)
    }

    // O modelo pediu um cálculo: roda aqui e devolve o resultado pra ele.
    if (json.stop_reason === "tool_use") {
      const chamadas = blocks.filter((b) => b.type === "tool_use")
      if (chamadas.length === 0) break
      apiMessages.push({ role: "assistant", content: blocks })
      const resultados = await Promise.all(
        chamadas.map(async (c) => {
          const f = ferramentas.find((x) => x.name === c.name)
          let saida: string
          try {
            saida = f
              ? await f.run(c.input ?? {})
              : `Ferramenta "${c.name}" não existe.`
          } catch (e) {
            console.error(`ferramenta ${c.name}:`, e)
            saida = "Não consegui calcular isso agora."
          }
          return { type: "tool_result", tool_use_id: c.id, content: saida }
        }),
      )
      apiMessages.push({ role: "user", content: resultados })
      continue
    }

    if (json.stop_reason !== "pause_turn") break
    apiMessages.push({ role: "assistant", content: blocks })
  }

  opts.onUso?.(uso)
  // Junta com linha em branco, não com "". Cada elemento é um bloco de texto
  // separado — de antes e de depois de uma ferramenta ou de uma busca. Com
  // join("") o fim de um grudava no começo do outro ("Deixa eu buscar
  // isso:**Seu produto mais vendido é:**"). Vazios saem fora pra não virar
  // linha em branco sobrando.
  const text = textos
    .map((t) => t.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim()
  if (!text) throw new AnthropicError("Resposta do Claude sem texto.")
  return text
}

/**
 * Ferramenta que o modelo pode CHAMAR durante a resposta.
 *
 * Serve pro que não cabe (ou não deve caber) no contexto fixo: em vez de
 * despejar todos os dias do mês no prompt e torcer pro modelo somar certo, a
 * gente declara "sei somar um período" e o SERVIDOR faz a conta quando ele
 * pede. O número volta exato e o contexto não cresce.
 *
 * `run` recebe o input já parseado e devolve o texto que vai voltar pro
 * modelo (normalmente um JSON compacto).
 */
export type FerramentaIa = {
  name: string
  description: string
  input_schema: Record<string, unknown>
  run: (input: Record<string, unknown>) => Promise<string>
}

export type ChatStreamEvent =
  | { type: "searching" }
  /** O modelo pediu um cálculo ao servidor (ex.: total de um período). */
  | { type: "consultando"; ferramenta: string }
  | { type: "text"; text: string }

/**
 * Igual ao askClaudeChat, mas em STREAMING: devolve um gerador que emite
 * `{type:"searching"}` no exato momento em que o modelo dispara a busca na web
 * e `{type:"text", text}` a cada pedaço de resposta (palavra a palavra). No fim
 * `return` devolve o texto completo. Assim a tela consegue mostrar "Pesquisando
 * na web…" quando ele de fato pesquisa — não por adivinhação.
 */
export async function* streamClaudeChat(opts: {
  system: string | SystemBloco[]
  messages: ChatTurn[]
  maxTokens?: number
  model?: string
  webSearch?: boolean
  /** Ferramentas que o modelo pode chamar (executadas aqui no servidor). */
  ferramentas?: FerramentaIa[]
  /** Recebe o consumo (tokens/buscas) pra quem chamou registrar o custo. */
  onUso?: (uso: UsoIa) => void
}): AsyncGenerator<ChatStreamEvent, string, void> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new AnthropicError("ANTHROPIC_API_KEY não configurada.")
  const uso = usoVazio(opts.model || diagnosticoModel())

  const ferramentas = opts.ferramentas ?? []
  const tools = [
    ...(opts.webSearch
      ? [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }]
      : []),
    ...ferramentas.map((f) => ({
      name: f.name,
      description: f.description,
      input_schema: f.input_schema,
    })),
  ]

  // Histórico mutável: quando o modelo chama uma ferramenta, a gente empilha o
  // turno dele + o resultado e roda OUTRA rodada de streaming pra ele concluir.
  const apiMessages: { role: string; content: unknown }[] = opts.messages.map(
    (m) => ({ role: m.role, content: m.content }),
  )

  let full = ""
  let avisouBusca = false

  // Limite de rodadas: 1 resposta direta + até 2 chamadas de ferramenta.
  for (let rodada = 0; rodada < 3; rodada++) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model || diagnosticoModel(),
        max_tokens: opts.maxTokens ?? (opts.webSearch ? 1500 : 1200),
        system: systemPayload(opts.system),
        messages: apiMessages,
        stream: true,
        ...(tools.length ? { tools } : {}),
      }),
    })

    if (!res.ok || !res.body) {
      const body = res.body ? await res.text().catch(() => "") : ""
      throw new AnthropicError(
        `Claude respondeu ${res.status}: ${body.slice(0, 300)}`,
      )
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let stopReason = ""
    // Blocos desta rodada, na ordem — precisam ser devolvidos INTACTOS no
    // próximo turno, senão a API recusa o tool_result órfão.
    const blocos: { tipo: "text" | "tool_use"; texto: string; id?: string; nome?: string }[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl: number
      // SSE: linhas "data: {...}\n". Cada evento vem numa linha data:.
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (!line.startsWith("data:")) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === "[DONE]") continue
        let evt: {
          type?: string
          content_block?: { type?: string; id?: string; name?: string }
          delta?: {
            type?: string
            text?: string
            partial_json?: string
            stop_reason?: string
          }
          // No streaming o consumo chega em 2 partes: os tokens de ENTRADA no
          // message_start e os de SAÍDA no message_delta (evento final).
          message?: { usage?: UsageApi }
          usage?: UsageApi
        }
        try {
          evt = JSON.parse(payload)
        } catch {
          continue
        }
        if (evt.type === "message_start") {
          somarUso(uso, evt.message?.usage)
        } else if (evt.type === "message_delta") {
          somarUso(uso, evt.usage)
          if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason
        }
        if (evt.type === "content_block_start") {
          const t = evt.content_block?.type
          // A busca web abre como server_tool_use / web_search_tool_result.
          if (
            (t === "server_tool_use" || t === "web_search_tool_result") &&
            !avisouBusca
          ) {
            avisouBusca = true
            yield { type: "searching" }
          } else if (t === "tool_use") {
            const nome = evt.content_block?.name ?? ""
            blocos.push({
              tipo: "tool_use",
              texto: "",
              id: evt.content_block?.id,
              nome,
            })
            yield { type: "consultando", ferramenta: nome }
          } else if (t === "text") {
            blocos.push({ tipo: "text", texto: "" })
          }
        } else if (evt.type === "content_block_delta") {
          const atual = blocos[blocos.length - 1]
          if (evt.delta?.type === "text_delta") {
            const txt = evt.delta.text ?? ""
            if (txt) {
              full += txt
              if (atual?.tipo === "text") atual.texto += txt
              yield { type: "text", text: txt }
            }
          } else if (evt.delta?.type === "input_json_delta") {
            // O argumento da ferramenta chega em pedaços de JSON.
            if (atual?.tipo === "tool_use") atual.texto += evt.delta.partial_json ?? ""
          }
        }
      }
    }

    const chamadas = blocos.filter((b) => b.tipo === "tool_use")
    if (stopReason !== "tool_use" || chamadas.length === 0) break

    // Devolve o turno do assistente EXATAMENTE como veio…
    apiMessages.push({
      role: "assistant",
      content: blocos.map((b) =>
        b.tipo === "text"
          ? { type: "text", text: b.texto }
          : {
              type: "tool_use",
              id: b.id,
              name: b.nome,
              input: parseJsonSeguro(b.texto),
            },
      ),
    })
    // …e o resultado de cada ferramenta. Erro vira texto pro modelo explicar,
    // nunca uma exceção que derrubaria a resposta inteira.
    const resultados = await Promise.all(
      chamadas.map(async (c) => {
        const f = ferramentas.find((x) => x.name === c.nome)
        let saida: string
        try {
          saida = f
            ? await f.run(parseJsonSeguro(c.texto))
            : `Ferramenta "${c.nome}" não existe.`
        } catch (e) {
          console.error(`ferramenta ${c.nome}:`, e)
          saida = "Não consegui calcular isso agora."
        }
        return { type: "tool_result", tool_use_id: c.id, content: saida }
      }),
    )
    apiMessages.push({ role: "user", content: resultados })

    // Separador entre o que o modelo escreveu ANTES de chamar a ferramenta e o
    // que ele escreve DEPOIS. Sem isto os dois trechos são concatenados sem
    // nada no meio e saem colados na tela ("Deixa eu buscar isso:**Seu produto
    // mais vendido é:**"). O ideal é o modelo nem narrar a consulta (o prompt
    // pede isso e a interface já mostra "consultando"), mas quando ele narra,
    // a emenda não pode virar palavra grudada.
    if (full.trim() && !/\n\s*$/.test(full)) {
      full += "\n\n"
      yield { type: "text", text: "\n\n" }
    }
  }

  opts.onUso?.(uso)
  const finalText = full.trim()
  if (!finalText) throw new AnthropicError("Resposta do Claude sem texto.")
  return finalText
}

/** JSON do argumento da ferramenta; vazio/quebrado vira objeto vazio. */
function parseJsonSeguro(s: string): Record<string, unknown> {
  if (!s.trim()) return {}
  try {
    return JSON.parse(s) as Record<string, unknown>
  } catch {
    return {}
  }
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
