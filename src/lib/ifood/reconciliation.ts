/**
 * Reconciliation On Demand — iFood Merchant API (financial).
 *
 * ⚠️ A API antiga (GET .../reconciliation?competence=) foi DESCONTINUADA pelo
 * iFood. Agora o extrato é gerado SOB DEMANDA, de forma assíncrona:
 *
 *   1. POST /financial/v3.0/merchants/{id}/reconciliation/on-demand {competence}
 *      → 202 { requestId }   (ou 409 se já houver pedido recente → reusa o id)
 *   2. GET  /financial/v3.0/merchants/{id}/reconciliation/on-demand/{requestId}
 *      → { status: created → processing → processed, filePath }   (~30–60s)
 *   3. baixa filePath (S3 presigned, .gz CSV ";") → gunzip → parse
 *   4. persiste em ifood_financeiro_lancamentos (no caller)
 *
 * Limite: 1 pedido novo por competência a cada 6h (409 devolve o requestId
 * vigente, que pode ser consultado/baixado normalmente). Vantagem: gera o
 * arquivo até pra lojas que NÃO têm extrato pré-gerado (o que dava 404 no antigo).
 *
 * Doc: https://developer.ifood.com.br/pt-BR/docs/guides/modules/financial/api-reconciliation-ondemand/
 */
import "server-only"

import { gunzipSync } from "node:zlib"

import { fetchIfood, type IfoodFetchResult } from "./client"

const ON_DEMAND_TPL =
  "/financial/v3.0/merchants/{merchantId}/reconciliation/on-demand"

function onDemandPath(merchantId: string): string {
  return ON_DEMAND_TPL.replace("{merchantId}", encodeURIComponent(merchantId))
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

type OnDemandRequest = {
  ok: boolean
  requestId?: string
  /** 202 = pedido novo; 409 = reusando pedido recente das últimas 6h */
  status: number
  error?: string
}

/**
 * Solicita a geração do extrato (POST). Em 409 (já existe pedido recente nas
 * últimas 6h), o iFood devolve o requestId vigente na mensagem — reusamos.
 */
export async function requestReconciliation(
  merchantId: string,
  competencia: string,
): Promise<OnDemandRequest> {
  if (!/^\d{4}-\d{2}$/.test(competencia)) {
    throw new Error(
      `competencia deve estar no formato YYYY-MM (recebido: ${competencia})`,
    )
  }
  const r = await fetchIfood<{ requestId?: string }>({
    path: onDemandPath(merchantId),
    method: "POST",
    body: { competence: competencia },
    responseType: "json",
    merchantId,
    endpointLabel: "POST /financial/v3.0/merchants/{id}/reconciliation/on-demand",
  })
  if (r.status === 202 && r.data?.requestId) {
    return { ok: true, requestId: r.data.requestId, status: 202 }
  }
  // 409: "There is already a recent and valid request Id: <uuid>. ..."
  if (r.status === 409) {
    const m = r.raw.match(/request Id:\s*([0-9a-fA-F-]{36})/)
    if (m) return { ok: true, requestId: m[1], status: 409 }
  }
  return { ok: false, status: r.status, error: r.error ?? r.raw.slice(0, 200) }
}

export type OnDemandStatus = {
  id?: string
  /** created | processing | processed | failed | … */
  status?: string
  filePath?: string
  downloadPath?: string
  metadata?: { total_linhas?: string; sha256?: string } | null
}

/** Consulta o pedido pelo requestId (status + filePath quando processado). */
export async function getReconciliationRequest(
  merchantId: string,
  requestId: string,
): Promise<IfoodFetchResult<OnDemandStatus>> {
  return fetchIfood<OnDemandStatus>({
    path: `${onDemandPath(merchantId)}/${encodeURIComponent(requestId)}`,
    method: "GET",
    responseType: "json",
    merchantId,
    endpointLabel:
      "GET /financial/v3.0/merchants/{id}/reconciliation/on-demand/{requestId}",
  })
}

/**
 * Baixa o .gz da URL presigned e descompacta.
 * Não vai pelo fetchIfood (URL S3, sem auth bearer + sem header de homolog).
 */
export async function downloadAndDecompress(
  downloadUrl: string,
): Promise<{ csv: string; sizeBytes: number; durationMs: number }> {
  const t0 = Date.now()
  const res = await fetch(downloadUrl, { cache: "no-store" })
  if (!res.ok) {
    const txt = await res.text().catch(() => "")
    throw new Error(`Download .gz falhou (HTTP ${res.status}): ${txt.slice(0, 200)}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  const decompressed = gunzipSync(buf)
  return {
    csv: decompressed.toString("utf-8"),
    sizeBytes: buf.byteLength,
    durationMs: Date.now() - t0,
  }
}

/**
 * Parse CSV com separador `;`. Trata aspas duplas simples.
 * Retorna array de objetos { columnName: stringValue }.
 *
 * O parser é minimalista de propósito: o CSV do iFood é gerado por sistema,
 * sem newlines dentro de células e com aspas só pra escape ocasional.
 */
export function parseCsvSemicolon(csv: string): {
  headers: string[]
  rows: Record<string, string>[]
} {
  const lines = csv.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }
  const headers = parseCsvLine(lines[0])
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i])
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] ?? "").trim()
    }
    rows.push(row)
  }
  return { headers, rows }
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cur += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ";") {
        out.push(cur)
        cur = ""
      } else {
        cur += ch
      }
    }
  }
  out.push(cur)
  return out
}

/** Resultado de download + parse da conciliação, com TODAS as linhas. */
export type ReconciliationRowsResult =
  | {
      ok: true
      linkStatus: number
      downloadUrl: string
      retries: number
      durationMs: number
      sizeBytes: number
      decompressedDurationMs: number
      headers: string[]
      rows: Record<string, string>[]
    }
  | {
      ok: false
      linkStatus: number
      linkRaw?: string
      downloadUrl?: string
      linkError?: string
      retries: number
      durationMs: number
    }

/**
 * Baixa e parseia a conciliação de uma competência, devolvendo TODAS as linhas.
 *
 * Base compartilhada entre a UI de homologação (que fatia uma amostra +
 * calcula métricas) e o sync automático (que persiste tudo no banco).
 */
export async function downloadReconciliationRows(
  merchantId: string,
  competencia: string,
  opts: { maxWaitMs?: number; pollMs?: number } = {},
): Promise<ReconciliationRowsResult> {
  const t0 = Date.now()
  const maxWaitMs = opts.maxWaitMs ?? 150_000
  const pollMs = opts.pollMs ?? 5_000

  // 1. Solicita (ou reusa, via 409) a geração do extrato.
  const req = await requestReconciliation(merchantId, competencia)
  if (!req.ok || !req.requestId) {
    return {
      ok: false,
      linkStatus: req.status,
      linkError: req.error,
      retries: 0,
      durationMs: Date.now() - t0,
    }
  }

  // 2. Faz polling até o status virar "processed" (ou estourar o tempo).
  //
  // A espera CRESCE a cada tentativa (5s → 10 → 20 → 40, teto de 30s). Antes
  // era intervalo fixo, e o relatório demora o que demora: perguntar a cada 5
  // segundos não o entrega mais cedo, só gasta chamada. Medido em 05/ago/26:
  // 395 relatórios pedidos consumiram ~3.400 consultas, e 252 delas voltaram
  // 429. Como o teto do iFood é por APLICATIVO (confirmado por eles), essas
  // chamadas desperdiçadas tiram vez das outras lojas do mesmo processo.
  let filePath: string | undefined
  let lastStatus = 0
  let lastRaw = ""
  let espera = pollMs
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    const st = await getReconciliationRequest(merchantId, req.requestId)
    lastStatus = st.status
    lastRaw = st.raw
    const s = (st.data?.status ?? "").toLowerCase()
    if (st.ok && s === "processed") {
      filePath = st.data?.filePath ?? st.data?.downloadPath
      break
    }
    if (s === "failed" || s === "error" || s === "expired") {
      return {
        ok: false,
        linkStatus: st.status,
        linkRaw: st.raw,
        linkError: `Geração do extrato falhou (status "${s}")`,
        retries: 0,
        durationMs: Date.now() - t0,
      }
    }
    // Se o iFood pediu pra esperar (429 com Retry-After), obedece — insistir
    // no ritmo antigo depois de um 429 é o que transforma congestionamento em
    // cascata.
    const pedido = st.retryAfterMs
    await sleep(pedido ?? espera)
    // Teto de 30s: acima disso o ganho some e o risco é estourar o tempo total.
    espera = Math.min(espera * 2, 30_000)
  }
  if (!filePath) {
    return {
      ok: false,
      linkStatus: lastStatus,
      linkRaw: lastRaw,
      linkError: `Tempo esgotado esperando a geração do extrato (requestId ${req.requestId})`,
      retries: 0,
      durationMs: Date.now() - t0,
    }
  }

  // 3. Baixa o .gz presigned e descompacta.
  let dl: { csv: string; sizeBytes: number; durationMs: number }
  try {
    dl = await downloadAndDecompress(filePath)
  } catch (e) {
    return {
      ok: false,
      linkStatus: 200,
      downloadUrl: filePath,
      linkError: e instanceof Error ? e.message : String(e),
      retries: 0,
      durationMs: Date.now() - t0,
    }
  }

  const parsed = parseCsvSemicolon(dl.csv)
  return {
    ok: true,
    linkStatus: 200,
    downloadUrl: filePath,
    retries: 0,
    durationMs: Date.now() - t0,
    sizeBytes: dl.sizeBytes,
    decompressedDurationMs: dl.durationMs,
    headers: parsed.headers,
    rows: parsed.rows,
  }
}

/**
 * Orquestrador end-to-end: pega link → baixa → descompacta → parseia.
 * Retorna métricas + amostra (primeiras 50 linhas) pra UI da homologação.
 */
export async function fetchAndParseReconciliation(
  merchantId: string,
  competencia: string,
) {
  const res = await downloadReconciliationRows(merchantId, competencia)
  if (!res.ok) {
    return {
      ok: false as const,
      linkStatus: res.linkStatus,
      linkRaw: res.linkRaw,
      downloadUrl: res.downloadUrl,
      linkError: res.linkError,
      retries: res.retries,
      durationMs: res.durationMs,
    }
  }

  // Métricas de homologação: contagem por impacto_no_repasse e soma de valor
  let countSim = 0
  let sumSim = 0
  let countNao = 0
  for (const row of res.rows) {
    const impacto = (row.impacto_no_repasse ?? "").toUpperCase()
    const valor = Number(String(row.valor ?? "0").replace(",", "."))
    if (impacto === "SIM") {
      countSim++
      if (Number.isFinite(valor)) sumSim += valor
    } else if (impacto === "NAO" || impacto === "NÃO") {
      countNao++
    }
  }

  return {
    ok: true as const,
    linkStatus: res.linkStatus,
    downloadUrl: res.downloadUrl,
    retries: res.retries,
    durationMs: res.durationMs,
    sizeBytes: res.sizeBytes,
    decompressedDurationMs: res.decompressedDurationMs,
    headers: res.headers,
    rowCount: res.rows.length,
    sample: res.rows.slice(0, 50),
    metrics: { countSim, sumSim, countNao },
  }
}
