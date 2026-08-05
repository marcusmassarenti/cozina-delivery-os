/**
 * Cliente HTTP da Merchant API do iFood.
 *
 * Responsabilidades (que vamos demonstrar na homologação):
 *  - Anexa Authorization Bearer automaticamente (via getIfoodToken).
 *  - Anexa header `x-request-homologation: true` quando IFOOD_HOMOLOGATION=true
 *    (sandbox/teste); em produção, omite.
 *  - Em 401: clearIfoodTokenCache + retry uma vez (token expirou silenciosamente).
 *  - Em 429/5xx: backoff exponencial 2s, 4s, 8s (até 3 tentativas).
 *  - Loga TUDO em `ifood_api_logs` — sucesso ou falha — pra auditoria.
 *
 * Não trata throttle de 6h aqui (vai numa camada acima por endpoint).
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  clearIfoodTokenCache,
  getIfoodToken,
  isAppHomologation,
  type IfoodApp,
} from "./auth"

const BASE_URL = "https://merchant-api.ifood.com.br"
const MAX_RETRIES = 3
const BACKOFF_MS = [2000, 4000, 8000] // 2s, 4s, 8s

export type IfoodFetchOptions = {
  /** Path SEM base URL — ex.: "/order/v1.0/orders/abc-123" */
  path: string
  /** Qual app/credencial usar (default: financial). */
  app?: IfoodApp
  method?: "GET" | "POST" | "PUT" | "DELETE"
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  /** Headers extras (Authorization é setado automaticamente) */
  headers?: Record<string, string>
  /** Tipo esperado da resposta (afeta como lemos) */
  responseType?: "json" | "text" | "arrayBuffer"
  /** Pra log: amarra a chamada a uma unidade/merchant */
  unitId?: string
  merchantId?: string
  /** Etiqueta semântica do endpoint pro log (ex.: "GET /order/v1.0/orders/{id}") */
  endpointLabel?: string
}

export type IfoodFetchResult<T = unknown> = {
  ok: boolean
  status: number
  data: T | null
  /** Texto cru da resposta (útil pra debug e logs) */
  raw: string
  retries: number
  durationMs: number
  error?: string
  /**
   * Quanto o iFood mandou esperar (do header `Retry-After`), em ms.
   * Só vem preenchido num 429. Quem faz polling deve OBEDECER: insistir no
   * mesmo ritmo depois de um 429 alimenta o congestionamento em vez de
   * aliviá-lo — e o teto é por APLICATIVO, então quem insiste atrapalha as
   * outras lojas do mesmo processo, não só a si mesmo.
   */
  retryAfterMs?: number
}

function buildUrl(path: string, query?: IfoodFetchOptions["query"]): string {
  const url = new URL(path.startsWith("http") ? path : `${BASE_URL}${path}`)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }
  }
  return url.toString()
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Faz a chamada HTTP com auth + retry + log.
 */
export async function fetchIfood<T = unknown>(
  opts: IfoodFetchOptions,
): Promise<IfoodFetchResult<T>> {
  const method = opts.method ?? "GET"
  const app: IfoodApp = opts.app ?? "financial"
  const url = buildUrl(opts.path, opts.query)
  const responseType = opts.responseType ?? "json"
  const endpointLabel = opts.endpointLabel ?? `${method} ${opts.path}`
  const homolog = isAppHomologation(app)

  let retries = 0
  let retryAfterMs: number | undefined
  let lastStatus = 0
  let lastBody = ""
  let lastError: string | undefined
  let dataParsed: T | null = null

  const start = Date.now()

  while (retries <= MAX_RETRIES) {
    // (Re)obtém token a cada tentativa (cache cuida disso)
    let token: string
    try {
      token = await getIfoodToken(app)
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Falha ao obter token"
      lastStatus = 0
      break
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(opts.headers ?? {}),
    }
    if (homolog) headers["x-request-homologation"] = "true"
    if (opts.body !== undefined && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json"
    }

    let res: Response
    try {
      res = await fetch(url, {
        method,
        headers,
        body:
          opts.body === undefined
            ? undefined
            : typeof opts.body === "string"
              ? opts.body
              : JSON.stringify(opts.body),
        cache: "no-store",
      })
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Erro de rede"
      lastStatus = 0
      retries++
      if (retries <= MAX_RETRIES) {
        await sleep(BACKOFF_MS[Math.min(retries - 1, BACKOFF_MS.length - 1)])
        continue
      }
      break
    }

    lastStatus = res.status
    // 401: força re-auth e tenta 1×
    if (res.status === 401 && retries === 0) {
      clearIfoodTokenCache(app)
      retries++
      continue
    }
    // 429/5xx: backoff. Num 429 o iFood costuma dizer QUANTO esperar no header
    // `Retry-After` (segundos). Obedecer é melhor que chutar: nosso backoff
    // fixo pode ser curto demais e virar nova rajada.
    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      lastBody = await res.text().catch(() => "")
      if (res.status === 429) {
        const ra = Number(res.headers.get("retry-after"))
        // Teto de 60s: header maluco não pode pendurar a function inteira.
        if (Number.isFinite(ra) && ra > 0) {
          retryAfterMs = Math.min(ra * 1000, 60_000)
        }
      }
      retries++
      if (retries <= MAX_RETRIES) {
        await sleep(
          retryAfterMs ??
            BACKOFF_MS[Math.min(retries - 1, BACKOFF_MS.length - 1)],
        )
        continue
      }
      break
    }

    // 2xx ou erro definitivo (4xx que não vamos retentar)
    if (responseType === "json") {
      lastBody = await res.text().catch(() => "")
      if (lastBody) {
        try {
          dataParsed = JSON.parse(lastBody) as T
        } catch {
          // Resposta dizia JSON mas veio texto. Mantém raw, data fica null.
        }
      }
    } else if (responseType === "text") {
      lastBody = await res.text().catch(() => "")
      dataParsed = lastBody as unknown as T
    } else {
      // arrayBuffer: pra .gz da Reconciliation On Demand
      const buf = await res.arrayBuffer()
      lastBody = `[binary ${buf.byteLength} bytes]`
      dataParsed = buf as unknown as T
    }
    break
  }

  const durationMs = Date.now() - start
  const ok = lastStatus >= 200 && lastStatus < 300

  // Log de auditoria (não bloqueia caller se falhar)
  void logCall({
    endpointLabel,
    method,
    url,
    requestHeaders: { ...(opts.headers ?? {}), Authorization: "Bearer ***" },
    requestBody: opts.body ?? null,
    responseStatus: lastStatus,
    responseBody: lastBody.slice(0, 50_000), // limita pra não estourar
    responseSizeBytes: lastBody.length,
    durationMs,
    retryCount: retries,
    error: ok ? null : (lastError ?? `HTTP ${lastStatus}`),
    homologationHeader: homolog,
    unitId: opts.unitId,
    merchantId: opts.merchantId,
  })

  return {
    ok,
    status: lastStatus,
    data: dataParsed,
    raw: lastBody,
    retries,
    durationMs,
    error: ok ? undefined : (lastError ?? `HTTP ${lastStatus}`),
    retryAfterMs,
  }
}

async function logCall(p: {
  endpointLabel: string
  method: string
  url: string
  requestHeaders: Record<string, string>
  requestBody: unknown
  responseStatus: number
  responseBody: string
  responseSizeBytes: number
  durationMs: number
  retryCount: number
  error: string | null
  homologationHeader: boolean
  unitId?: string
  merchantId?: string
}): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from("ifood_api_logs").insert({
      endpoint: p.endpointLabel,
      method: p.method,
      url: p.url,
      request_headers: p.requestHeaders,
      request_body: p.requestBody,
      response_status: p.responseStatus,
      response_body: p.responseBody,
      response_size_bytes: p.responseSizeBytes,
      duration_ms: p.durationMs,
      retry_count: p.retryCount,
      error_message: p.error,
      homologation_header: p.homologationHeader,
      unit_id: p.unitId ?? null,
      merchant_id: p.merchantId ?? null,
    })
  } catch (e) {
    // não deixa o log derrubar o caller
    console.error("ifood log failed:", e)
  }
}
