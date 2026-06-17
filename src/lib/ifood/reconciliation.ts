/**
 * Reconciliation API v3 — iFood Merchant API.
 *
 * Fluxo:
 *   1. GET /v3/reconciliation?merchantId=X&competencia=YYYY-MM
 *      → retorna { downloadUrl } (link S3 com expiração de 24h)
 *   2. GET no downloadUrl (sem auth — é URL presigned)
 *      → arquivo CSV.gz
 *   3. gunzip + parse CSV (separador ";")
 *      → linhas com 30+ campos financeiros
 *   4. UPSERT em ifood_financeiro_lancamentos
 *
 * Critérios de homologação atendidos:
 *   - Consulta por competência específica ✓
 *   - Download + descompactação ✓
 *   - Parse linha-por-linha (streaming via split, não JSON.parse de tudo) ✓
 *   - Filtro impacto_no_repasse = SIM pra valor líquido (no caller) ✓
 *
 * Doc: https://developer.ifood.com.br/pt-BR/docs/guides/modules/financial/api-reconciliation/
 */
import "server-only"

import { gunzipSync } from "node:zlib"

import { fetchIfood } from "./client"

// Doc literal diz "/v3/reconciliation" (mas o gateway responde "no Route
// matched"). Padrão da Merchant API: {módulo}/{versão}/merchants/{id}/{recurso}
// (ex: /order/v1.0/orders/{id}, /merchant/v1.0/merchants/{id}). Por isso o
// merchantId vai no PATH e a competência fica como query.
const RECON_ENDPOINT_PATH_TPL = "/financial/v3.0/merchants/{merchantId}/reconciliation"

export type ReconciliationLinkResponse = {
  /** Campo real retornado pelo iFood — S3 presigned do .gz */
  downloadPath?: string
  /** Aliases observados em outras versões / fallback */
  downloadUrl?: string
  url?: string
  link?: string
  expiresAt?: string
}

/** Resposta do iFood: URL temporária pro arquivo .gz */
export async function getReconciliationLink(
  merchantId: string,
  competencia: string,
) {
  if (!/^\d{4}-\d{2}$/.test(competencia)) {
    throw new Error(
      `competencia deve estar no formato YYYY-MM (recebido: ${competencia})`,
    )
  }
  const path = RECON_ENDPOINT_PATH_TPL.replace(
    "{merchantId}",
    encodeURIComponent(merchantId),
  )
  // A doc do iFood (pt-BR) diz `competencia`, mas a API real espera
  // `competence` (inglês) — descoberto via 400 BAD_REQUEST do próprio iFood.
  return fetchIfood<ReconciliationLinkResponse>({
    path,
    method: "GET",
    query: { competence: competencia },
    responseType: "json",
    merchantId,
    endpointLabel: "GET /financial/v3.0/merchants/{id}/reconciliation",
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

/**
 * Orquestrador end-to-end: pega link → baixa → descompacta → parseia.
 * Retorna métricas + amostra (primeiras 50 linhas) pra UI da homologação.
 */
export async function fetchAndParseReconciliation(
  merchantId: string,
  competencia: string,
) {
  const linkRes = await getReconciliationLink(merchantId, competencia)
  if (!linkRes.ok || !linkRes.data) {
    return {
      ok: false as const,
      linkStatus: linkRes.status,
      linkRaw: linkRes.raw,
      linkError: linkRes.error,
      retries: linkRes.retries,
      durationMs: linkRes.durationMs,
    }
  }
  const downloadUrl =
    linkRes.data.downloadPath ??
    linkRes.data.downloadUrl ??
    linkRes.data.url ??
    linkRes.data.link
  if (!downloadUrl) {
    return {
      ok: false as const,
      linkStatus: linkRes.status,
      linkRaw: linkRes.raw,
      linkError: "Resposta sem campo downloadPath/downloadUrl/url/link",
      retries: linkRes.retries,
      durationMs: linkRes.durationMs,
    }
  }

  let dl: { csv: string; sizeBytes: number; durationMs: number }
  try {
    dl = await downloadAndDecompress(downloadUrl)
  } catch (e) {
    return {
      ok: false as const,
      linkStatus: linkRes.status,
      linkRaw: linkRes.raw,
      downloadUrl,
      linkError: e instanceof Error ? e.message : String(e),
      retries: linkRes.retries,
      durationMs: linkRes.durationMs,
    }
  }

  const parsed = parseCsvSemicolon(dl.csv)
  // Métricas de homologação: contagem por impacto_no_repasse e soma de valor
  let countSim = 0
  let sumSim = 0
  let countNao = 0
  for (const row of parsed.rows) {
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
    linkStatus: linkRes.status,
    downloadUrl,
    retries: linkRes.retries,
    durationMs: linkRes.durationMs,
    sizeBytes: dl.sizeBytes,
    decompressedDurationMs: dl.durationMs,
    headers: parsed.headers,
    rowCount: parsed.rows.length,
    sample: parsed.rows.slice(0, 50),
    metrics: { countSim, sumSim, countNao },
  }
}
