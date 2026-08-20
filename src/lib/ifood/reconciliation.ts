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
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Janela em que o iFood reaproveita o pedido de extrato em vez de criar um
 * novo. É REGRA DELES (6h), não nossa — por isso o número mora aqui perto do
 * uso, e não numa config: se eles mudarem, o conserto é uma linha neste lugar.
 *
 * Descontamos 5 minutos da borda. Um pedido feito a 5h59 ainda seria aceito
 * pela nossa conta e recusado pela deles, e o caso de borda voltaria a gastar
 * exatamente a chamada 409 que este cache existe pra evitar.
 */
const JANELA_REUSO_MS = 6 * 60 * 60 * 1000 - 5 * 60 * 1000

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
  /** 202 = pedido novo; 409 = reusando o vigente; 0 = reusado do nosso cache */
  status: number
  /**
   * O pedido nasceu AGORA (202). Falso quando reusamos um id anterior — e a
   * diferença importa: relatório recém-pedido ainda não existe, relatório de
   * um pedido antigo quase sempre já está pronto. É isso que decide se vale
   * esperar antes da primeira consulta.
   */
  novo?: boolean
  error?: string
}

/** Lê o requestId ainda dentro da janela de reuso. Falha de leitura = sem cache. */
async function pedidoVigente(
  merchantId: string,
  competencia: string,
): Promise<string | null> {
  try {
    const { data } = await createAdminClient()
      .from("ifood_reconciliation_pedidos")
      .select("request_id, criado_em")
      .eq("merchant_id", merchantId)
      .eq("competencia", competencia)
      .maybeSingle()
    const p = data as { request_id: string; criado_em: string } | null
    if (!p) return null
    if (Date.now() - Date.parse(p.criado_em) > JANELA_REUSO_MS) return null
    return p.request_id
  } catch (e) {
    // Cache indisponível NÃO pode impedir o extrato: sem ele o comportamento
    // volta a ser o de antes (chama, leva 409, lê o id da mensagem).
    console.error("[reconciliation] cache de pedido:", e)
    return null
  }
}

/**
 * Esquece o pedido guardado. Chamado quando ele NÃO entrega o arquivo.
 *
 * Sem isto, um id que morreu do lado do iFood (expirou, falhou) ficaria sendo
 * reusado a cada tentativa por até 6 horas — a loja passaria a manhã inteira
 * falhando pelo mesmo motivo, e o cache que existe pra economizar chamada
 * viraria a causa do problema. Esquecer devolve o comportamento antigo: a
 * próxima tentativa pede um extrato novo.
 */
/**
 * Marca uma competência como SEM MOVIMENTO — e nunca mais pede o extrato dela.
 *
 * Ver a nota na migration `ifood_competencia_vazia`: sem essa memória o coletor
 * redescobre o vazio a cada rodada e fica pedindo pra sempre um mês em que a
 * loja não existia.
 */
export async function marcarCompetenciaVazia(
  merchantId: string,
  competencia: string,
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from("ifood_competencia_vazia")
    .upsert(
      { merchant_id: merchantId, competencia },
      { onConflict: "merchant_id,competencia" },
    )
  if (error) console.error("marcarCompetenciaVazia:", error.message)
}

/** As competências já confirmadas como sem movimento — pra pular na fila. */
export async function competenciasVazias(): Promise<Set<string>> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("ifood_competencia_vazia")
    .select("merchant_id, competencia")
  return new Set(
    ((data ?? []) as { merchant_id: string; competencia: string }[]).map(
      (r) => `${r.merchant_id}|${r.competencia}`,
    ),
  )
}

export async function esquecerPedido(
  merchantId: string,
  competencia: string,
): Promise<void> {
  try {
    await createAdminClient()
      .from("ifood_reconciliation_pedidos")
      .delete()
      .eq("merchant_id", merchantId)
      .eq("competencia", competencia)
  } catch (e) {
    console.error("[reconciliation] esquecer pedido:", e)
  }
}

/**
 * Extratos JÁ PEDIDOS e ainda dentro da janela de reuso — a fila do coletor.
 *
 * Esta tabela nasceu como cache (evitar pedir duas vezes o mesmo extrato em 6h)
 * e é, sem ter sido projetada pra isso, uma fila de trabalho pendente: cada
 * linha é um arquivo que o iFood está gerando e que ninguém foi buscar. O
 * coletor lê daqui; quem baixa com sucesso apaga a linha.
 */
export async function pedidosVigentes(): Promise<
  { merchantId: string; competencia: string; requestId: string; criadoEm: string }[]
> {
  const corte = new Date(Date.now() - JANELA_REUSO_MS).toISOString()
  const { data } = await createAdminClient()
    .from("ifood_reconciliation_pedidos")
    .select("merchant_id, competencia, request_id, criado_em")
    .gt("criado_em", corte)
    .order("criado_em")
  return ((data ?? []) as {
    merchant_id: string
    competencia: string
    request_id: string
    criado_em: string
  }[]).map((r) => ({
    merchantId: r.merchant_id,
    competencia: r.competencia,
    requestId: r.request_id,
    criadoEm: r.criado_em,
  }))
}

async function guardarPedido(
  merchantId: string,
  competencia: string,
  requestId: string,
): Promise<void> {
  try {
    await createAdminClient()
      .from("ifood_reconciliation_pedidos")
      .upsert(
        {
          merchant_id: merchantId,
          competencia,
          request_id: requestId,
          criado_em: new Date().toISOString(),
        },
        { onConflict: "merchant_id,competencia" },
      )
  } catch (e) {
    console.error("[reconciliation] gravar pedido:", e)
  }
}

/**
 * Solicita a geração do extrato (POST). Em 409 (já existe pedido recente nas
 * últimas 6h), o iFood devolve o requestId vigente na mensagem — reusamos.
 *
 * Antes de chamar, confere se JÁ temos o id vigente guardado. Sem essa
 * conferência, a segunda tentativa dentro da janela de 6h gastava um POST só
 * pra receber 409 e ler da mensagem o id que já estava no nosso banco — foram
 * 1.253 chamadas assim em 30 dias (medido em 13/08/2026). O teto do iFood é
 * por APLICATIVO: chamada jogada fora numa loja tira a vez de outra.
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

  const guardado = await pedidoVigente(merchantId, competencia)
  if (guardado) return { ok: true, requestId: guardado, status: 0, novo: false }

  const r = await fetchIfood<{ requestId?: string }>({
    path: onDemandPath(merchantId),
    method: "POST",
    body: { competence: competencia },
    responseType: "json",
    merchantId,
    endpointLabel: "POST /financial/v3.0/merchants/{id}/reconciliation/on-demand",
  })
  if (r.status === 202 && r.data?.requestId) {
    await guardarPedido(merchantId, competencia, r.data.requestId)
    return { ok: true, requestId: r.data.requestId, status: 202, novo: true }
  }
  // 409: "There is already a recent and valid request Id: <uuid>. ..."
  //
  // Guarda o id que veio na recusa: é o mesmo que o iFood devolveria na
  // próxima tentativa, então esta é a última vez que essa loja precisa gastar
  // um 409 nesta competência.
  if (r.status === 409) {
    const m = r.raw.match(/request Id:\s*([0-9a-fA-F-]{36})/)
    if (m) {
      await guardarPedido(merchantId, competencia, m[1])
      return { ok: true, requestId: m[1], status: 409, novo: false }
    }
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
      /**
       * A loja não teve movimento nesta competência — resposta DEFINITIVA do
       * iFood, não falha transitória. Quem chama deve encerrar o mês, não
       * reagendar. Ver a nota no ponto onde é setado.
       */
      vazio?: boolean
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
  opts: {
    maxWaitMs?: number
    pollMs?: number
    /**
     * Ao estourar o tempo, joga fora o requestId guardado?
     *
     * `true` (padrão) é o certo pro sync DIÁRIO: ele espera 150s, e se nem
     * assim veio, o id provavelmente morreu — insistir nele travaria a loja
     * por horas.
     *
     * O COLETOR passa `false`, e a diferença é a razão de ele existir: ali o
     * tempo esgotado é o caso NORMAL (espera de 12s), não sintoma de id morto.
     * Descartar o pedido a cada rodada faria o coletor destruir exatamente o
     * trabalho que ele foi criado pra recolher — medido em 15/08/26: a
     * primeira versão apagou 5 pedidos válidos na primeira execução.
     */
    esquecerNoTimeout?: boolean
  } = {},
): Promise<ReconciliationRowsResult> {
  const t0 = Date.now()
  const maxWaitMs = opts.maxWaitMs ?? 150_000
  const pollMs = opts.pollMs ?? 5_000
  const esquecerNoTimeout = opts.esquecerNoTimeout ?? true

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

  // Pedido NOVO ainda não tem arquivo: espera antes da PRIMEIRA pergunta.
  //
  // Medido em 13/08/2026: 1.854 pedidos deram exatamente UM 404 cada — o da
  // primeira consulta — e TODOS os 1.854 viraram 200 logo em seguida. Nenhum
  // ficou só no 404. O relatório não existe no instante em que o pedido é
  // aceito, então perguntar ali é gastar uma chamada pra ouvir "ainda não".
  // Não atrasa nada: a geração leva ~30–60s, muito além desta espera.
  //
  // Pedido REUSADO é o contrário — foi feito minutos ou horas atrás e quase
  // sempre já está pronto. Ali a espera seria atraso puro, multiplicado por
  // dezenas de lojas na mesma rodada de cron.
  if (req.novo) {
    await sleep(espera)
    espera = Math.min(espera * 2, 30_000)
  }

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
      await esquecerPedido(merchantId, competencia)
      /**
       * "No financial entries exist" NÃO É FALHA — é resposta definitiva.
       *
       * O iFood devolve isso quando a loja simplesmente não teve movimento na
       * competência pedida: loja que abriu esse mês, mês anterior à
       * inauguração, período em que ficou fechada. Não há nada pra buscar
       * agora nem daqui a seis horas.
       *
       * Tratando como erro comum, o coletor repetia o mesmo pedido de 4 em 4
       * minutos por horas — foi o caso da Magic Açaí em 20/08/26, vinculada às
       * 18:30 e ainda martelando os meses de janeiro a julho às 19h. O teto de
       * chamadas do iFood é POR APLICATIVO, então essa insistência inútil
       * rouba banda das outras 60 lojas.
       *
       * `vazio: true` diz a quem chamou: encerre esta competência e siga.
       */
      const vazio = /no financial entries exist/i.test(st.raw ?? "")
      return {
        ok: false,
        vazio,
        linkStatus: st.status,
        linkRaw: st.raw,
        linkError: vazio
          ? "A loja não teve movimento no iFood nesta competência."
          : `Geração do extrato falhou (status "${s}")`,
        retries: 0,
        durationMs: Date.now() - t0,
      }
    }
    // Se o iFood pediu pra esperar (429 com Retry-After), obedece — insistir
    // no ritmo antigo depois de um 429 é o que transforma congestionamento em
    // cascata.
    await sleep(st.retryAfterMs ?? espera)
    // Teto de 30s: acima disso o ganho some e o risco é estourar o tempo total.
    espera = Math.min(espera * 2, 30_000)
  }
  if (!filePath) {
    // Estourou o tempo. Se o id era reusado, some com ele: pode ser um pedido
    // velho que nunca vai ficar pronto, e insistir nele trava a loja por horas.
    if (!req.novo && esquecerNoTimeout) {
      await esquecerPedido(merchantId, competencia)
    }
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
