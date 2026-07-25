/**
 * Cliente HTTP da API do Cardápio Web.
 *
 * Responsabilidades:
 *  - Pega o access_token da instalação (renova sozinho quando perto de vencer)
 *  - Respeita o rate limit ANTES de bater, espaçando as chamadas
 *  - 401 → força renovação do token e tenta 1×
 *  - 429/5xx → backoff exponencial, honrando o Retry-After quando vier
 *  - Loga tudo em `cardapioweb_api_logs`
 *
 * Sobre o rate limit: os tetos são POR ESTABELECIMENTO e variam por
 * endpoint. Como as funções da Vercel são efêmeras, o marcador em memória
 * não sobrevive entre execuções — ele serve pra não estourar DENTRO de um
 * sync (que é onde o risco mora, já que o job de detalhe dispara centenas
 * de chamadas seguidas). O 429 com backoff é a rede de segurança pro resto.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

import {
  cwBaseUrl,
  montarHeadersAuth,
  type CwAmbiente,
  type CwAuthMode,
} from "./auth"

const MAX_RETRIES = 3
const BACKOFF_MS = [2000, 4000, 8000]

/**
 * Tetos documentados pelo Cardápio Web. Quando dois se aplicam, vale o mais
 * restritivo — por isso `lento` existe separado: GET /merchant, GET /catalog
 * e GET /orders/history são só 5 por minuto.
 */
export type CwTier = "lento" | "catalogo" | "normal"

const TETOS: Record<CwTier, { req: number; janelaMs: number }> = {
  lento: { req: 5, janelaMs: 60_000 },
  catalogo: { req: 100, janelaMs: 180_000 },
  normal: { req: 300, janelaMs: 180_000 },
}

/** Marcador em memória: chave = `${installId}:${tier}` → timestamps recentes. */
const chamadas = new Map<string, number[]>()

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Segura a chamada até caber no teto. Retorna quantos ms esperou (só pra
 * o chamador conseguir logar/medir se quiser).
 */
async function respeitarLimite(
  installId: string,
  tier: CwTier,
): Promise<number> {
  const { req, janelaMs } = TETOS[tier]
  const chave = `${installId}:${tier}`
  const agora = Date.now()

  const recentes = (chamadas.get(chave) ?? []).filter(
    (t) => agora - t < janelaMs,
  )

  let esperou = 0
  if (recentes.length >= req) {
    // A mais antiga da janela define quando abre a próxima vaga.
    const liberaEm = recentes[0] + janelaMs - agora + 50
    if (liberaEm > 0) {
      await sleep(liberaEm)
      esperou = liberaEm
    }
  }

  const depois = (chamadas.get(chave) ?? []).filter(
    (t) => Date.now() - t < janelaMs,
  )
  depois.push(Date.now())
  chamadas.set(chave, depois)
  return esperou
}

export type CwFetchOptions = {
  installId: string
  ambiente: CwAmbiente
  /** Default 'oauth'. 'api_key' usa o modelo legado (X-API-KEY). */
  authMode?: CwAuthMode
  /** Path SEM base — ex.: "/api/partner/v1/orders/123" */
  path: string
  method?: "GET" | "POST" | "PUT" | "DELETE"
  /**
   * Valor em array vira parâmetro REPETIDO (`status[]=a&status[]=b`), que é
   * como a API do Cardápio Web espera lista. Com `set` só o último valor
   * sobrevivia — foi assim que o histórico ficou trazendo só `closed`.
   */
  query?: Record<
    string,
    string | number | boolean | undefined | readonly string[]
  >
  body?: unknown
  /** Teto de rate limit que se aplica a esse endpoint (default: normal). */
  tier?: CwTier
  /** Etiqueta do log — use o path genérico: "GET /orders/{id}" */
  endpointLabel?: string
}

export type CwFetchResult<T = unknown> = {
  ok: boolean
  status: number
  data: T | null
  raw: string
  retries: number
  durationMs: number
  error?: string
}

function montarUrl(
  ambiente: CwAmbiente,
  path: string,
  query?: CwFetchOptions["query"],
): string {
  const url = new URL(
    path.startsWith("http") ? path : `${cwBaseUrl(ambiente)}${path}`,
  )
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue
      if (Array.isArray(v)) {
        for (const item of v) url.searchParams.append(k, String(item))
      } else {
        url.searchParams.set(k, String(v))
      }
    }
  }
  return url.toString()
}

/** Retry-After pode vir em segundos; se vier, respeitamos em vez do backoff. */
function retryAfterMs(res: Response): number | null {
  const h = res.headers.get("retry-after")
  if (!h) return null
  const seg = Number(h)
  if (Number.isFinite(seg) && seg >= 0) return Math.min(seg * 1000, 60_000)
  return null
}

export async function fetchCw<T = unknown>(
  opts: CwFetchOptions,
): Promise<CwFetchResult<T>> {
  const method = opts.method ?? "GET"
  const tier = opts.tier ?? "normal"
  const url = montarUrl(opts.ambiente, opts.path, opts.query)
  const endpointLabel = opts.endpointLabel ?? `${method} ${opts.path}`

  let retries = 0
  let ultimoStatus = 0
  let ultimoCorpo = ""
  let ultimoErro: string | undefined
  let parsed: T | null = null
  let forcarRenovacao = false

  const inicio = Date.now()

  const authMode: CwAuthMode = opts.authMode ?? "oauth"

  while (retries <= MAX_RETRIES) {
    let auth: Record<string, string>
    try {
      auth = await montarHeadersAuth({
        installId: opts.installId,
        ambiente: opts.ambiente,
        authMode,
        forcar: forcarRenovacao,
      })
    } catch (e) {
      ultimoErro = e instanceof Error ? e.message : "Falha ao obter credencial"
      ultimoStatus = 0
      break
    }

    await respeitarLimite(opts.installId, tier)

    const headers: Record<string, string> = {
      ...auth,
      Accept: "application/json",
    }
    if (opts.body !== undefined) headers["Content-Type"] = "application/json"

    let res: Response
    try {
      res = await fetch(url, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        cache: "no-store",
      })
    } catch (e) {
      ultimoErro = e instanceof Error ? e.message : "Erro de rede"
      ultimoStatus = 0
      retries++
      if (retries <= MAX_RETRIES) {
        await sleep(BACKOFF_MS[Math.min(retries - 1, BACKOFF_MS.length - 1)])
        continue
      }
      break
    }

    ultimoStatus = res.status

    // 401 no OAuth: o token pode ter sido revogado antes de expirar — renova
    // e tenta 1×. No legado não há o que renovar, então cai direto no erro.
    if (res.status === 401 && authMode === "oauth" && !forcarRenovacao) {
      forcarRenovacao = true
      retries++
      continue
    }

    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      ultimoCorpo = await res.text().catch(() => "")
      retries++
      if (retries <= MAX_RETRIES) {
        const espera =
          retryAfterMs(res) ??
          BACKOFF_MS[Math.min(retries - 1, BACKOFF_MS.length - 1)]
        await sleep(espera)
        continue
      }
      break
    }

    ultimoCorpo = await res.text().catch(() => "")
    if (ultimoCorpo) {
      try {
        parsed = JSON.parse(ultimoCorpo) as T
      } catch {
        // Veio texto onde esperávamos JSON — mantém o raw e segue.
      }
    }
    break
  }

  const durationMs = Date.now() - inicio
  const ok = ultimoStatus >= 200 && ultimoStatus < 300

  void logar({
    installId: opts.installId,
    endpoint: endpointLabel,
    method,
    url,
    body: opts.body ?? null,
    status: ultimoStatus,
    corpo: ultimoCorpo.slice(0, 50_000),
    tamanho: ultimoCorpo.length,
    durationMs,
    retries,
    erro: ok ? null : (ultimoErro ?? `HTTP ${ultimoStatus}`),
    ambiente: opts.ambiente,
  })

  return {
    ok,
    status: ultimoStatus,
    data: parsed,
    raw: ultimoCorpo,
    retries,
    durationMs,
    error: ok ? undefined : (ultimoErro ?? `HTTP ${ultimoStatus}`),
  }
}

async function logar(p: {
  installId: string
  endpoint: string
  method: string
  url: string
  body: unknown
  status: number
  corpo: string
  tamanho: number
  durationMs: number
  retries: number
  erro: string | null
  ambiente: CwAmbiente
}): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from("cardapioweb_api_logs").insert({
      install_id: p.installId,
      endpoint: p.endpoint,
      method: p.method,
      url: p.url,
      request_body: p.body ?? null,
      response_status: p.status,
      response_body: p.corpo,
      response_size_bytes: p.tamanho,
      duration_ms: p.durationMs,
      retry_count: p.retries,
      error_message: p.erro,
      ambiente: p.ambiente,
    })
  } catch {
    // Log não pode derrubar a chamada de verdade.
  }
}
