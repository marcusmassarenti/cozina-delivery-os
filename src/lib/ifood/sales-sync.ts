/**
 * Sync do endpoint `financial/v3.0/merchants/{id}/sales` — o pedido VENDIDO,
 * com o que os Financial Events não trazem: valor dos itens (bag), FRETE
 * cobrado do cliente, taxa de serviço, quem entrega (logisticProvider),
 * produto logístico, canal e status.
 *
 * ## Por que existe (Varginha, 31/08/26)
 *
 * Loja de ENTREGA PRÓPRIA tem o frete somado no "Valor das vendas" do portal
 * ("Valor dos itens e entrega própria da loja"), mas o frete não aparece no
 * extrato nem nos events — só na planilha do Relatório de Pedidos, que virava
 * rotina manual pra ~39 lojas. O Marcus recusou a rotina ("o iFood não
 * construiria sem todas as informações") e estava certo: este endpoint SEMPRE
 * esteve no módulo financeiro que já temos homologado. Medido na Varginha:
 * bag+frete = R$ 19.778 contra R$ 19.267 do portal (a diferença é a loja
 * vendendo entre o print e a medição).
 *
 * ## Regras da API, medidas em produção (não estão na doc)
 *  - Janela máxima de 8 DIAS ("The maximum allowed search range is 8 days").
 *  - Página fixa de 20 itens; `size`/`pageSize`/`limit` são IGNORADOS.
 *  - Pedir página além da última dá 400 "Invalid page N. Maximum allowed is
 *    pageCount = M" — é FIM DE PÁGINAS, não erro.
 *  - O frete que bate com o portal é o BRUTO (`saleGrossValue.deliveryFee`),
 *    antes do desconto de frete grátis — igual à cesta, que é antes das
 *    promoções. O líquido (`delivery.prices.netValue`) ficou R$ 2 mil abaixo
 *    do portal na Varginha; não usar.
 *
 * ## Convivência com planilha e events (MESMA tabela, ifood_pedidos)
 * A planilha usa o MESMO uuid de pedido (verificado: `unit_id, pedido_id` é
 * UNIQUE e os dois lados gravam o uuid), então o upsert funde as fontes sem
 * duplicar. Este sync só escreve as colunas que a API de sales REALMENTE
 * traz; incentivo_*, turno e valor_liquido continuam sendo da planilha.
 * `source` segue a regra do pedidos-sync: default 'report', `marcarOrigemApi`
 * corrige só quem não veio de import (ver o comentário lá — a primeira versão
 * do events errou isso e linhas de planilha viravam 'api' de mentira).
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { fetchIfood } from "./client"
import { marcarOrigemApi } from "./pedidos-sync"

const PAGE_SIZE = 20
const JANELA_DIAS = 8
const MAX_PAGES = 400 // backstop: 400×20 = 8 mil pedidos numa janela de 8 dias

type Sale = {
  id: string
  shortId?: string | number
  createdAt?: string
  type?: string
  salesChannel?: string
  currentStatus?: string
  saleGrossValue?: { bag?: number; deliveryFee?: number; serviceFee?: number }
  delivery?: {
    deliveryParameters?: { logisticProvider?: string; deliveryProduct?: string }
  }
  payments?: { methods?: { method?: string; value?: number }[] }
}

export type SalesSyncResult = {
  competencia: string
  ok: boolean
  vendas: number
  gravados: number
  erro?: string
}

/** createdAt (UTC) → data-calendário de São Paulo. Sem DST no Brasil desde 2019. */
function spData(iso: string | undefined): string | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return new Date(t - 3 * 3600 * 1000).toISOString().slice(0, 10)
}

/** Janelas de ≤8 dias cobrindo a competência, sem passar de hoje. */
function janelasDeVenda(competencia: string): [string, string][] {
  const [ano, mes] = competencia.split("-").map(Number)
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  const hoje = spData(new Date().toISOString())!
  const out: [string, string][] = []
  for (let d = 1; d <= ultimo; d += JANELA_DIAS) {
    const de = `${competencia}-${String(d).padStart(2, "0")}`
    const ateDia = Math.min(d + JANELA_DIAS - 1, ultimo)
    let ate = `${competencia}-${String(ateDia).padStart(2, "0")}`
    if (de > hoje) break
    if (ate > hoje) ate = hoje
    out.push([de, ate])
  }
  return out
}

async function listarVendas(
  merchantId: string,
  unitId: string,
  de: string,
  ate: string,
): Promise<{ ok: true; vendas: Sale[] } | { ok: false; erro: string }> {
  const vendas: Sale[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await fetchIfood({
      path: `/financial/v3.0/merchants/${merchantId}/sales`,
      method: "GET",
      query: { beginSalesDate: de, endSalesDate: ate, page: String(page) },
      unitId,
      merchantId,
      endpointLabel: "GET /financial/v3.0/merchants/{id}/sales",
    })
    if (!r.ok) {
      // Fim de páginas vem como 400 — a mensagem diz "pageCount". Qualquer
      // outro erro é erro de verdade e NÃO pode virar lista vazia calada.
      if (r.status === 400 && /pageCount|Invalid page/i.test(r.raw ?? "")) break
      return { ok: false, erro: `sales ${de}..${ate} p${page}: HTTP ${r.status}` }
    }
    const arr = (Array.isArray(r.data)
      ? r.data
      : ((r.data as { sales?: Sale[] })?.sales ?? [])) as Sale[]
    vendas.push(...arr)
    if (arr.length < PAGE_SIZE) break
  }
  return { ok: true, vendas }
}

/**
 * Sincroniza as VENDAS de uma loja numa competência. Idempotente (upsert por
 * unit_id+pedido_id). Não mexe em coluna que a API de sales não traz.
 */
export async function syncSalesDaLoja(
  unitId: string,
  merchantId: string,
  competencia: string,
): Promise<SalesSyncResult> {
  const porPedido = new Map<string, Sale>()
  for (const [de, ate] of janelasDeVenda(competencia)) {
    const r = await listarVendas(merchantId, unitId, de, ate)
    if (!r.ok) return { competencia, ok: false, vendas: 0, gravados: 0, erro: r.erro }
    for (const s of r.vendas) {
      // `type` diferente de ORDER (se um dia aparecer) fica de fora — a
      // régua do bruto é sobre pedido.
      if (s.type && s.type !== "ORDER") continue
      if (s.id) porPedido.set(s.id, s)
    }
  }
  const vendas = [...porPedido.values()]
  if (vendas.length === 0) {
    return { competencia, ok: true, vendas: 0, gravados: 0 }
  }

  const linhas = vendas.flatMap((s) => {
    const data = spData(s.createdAt)
    if (!data) return []
    const [ano, mes] = data.split("-").map(Number)
    const metodos = (s.payments?.methods ?? [])
      .map((m) => m.method)
      .filter(Boolean)
      .sort() as string[]
    const totalPago = (s.payments?.methods ?? []).reduce(
      (a, m) => a + (Number(m.value) || 0),
      0,
    )
    return [
      {
        unit_id: unitId,
        pedido_id: s.id,
        pedido_id_curto: s.shortId != null ? String(s.shortId) : null,
        data,
        // timestamptz — o instante original; `data` é o dia-calendário em SP.
        horario: s.createdAt ?? null,
        ref_year: ano,
        ref_month: mes,
        status_final: s.currentStatus ?? null,
        valor_itens: Number(s.saleGrossValue?.bag ?? 0),
        // Frete BRUTO — a régua do portal (ver cabeçalho). Zero em entrega
        // parceira não aparece aqui como null: a API manda 0 ou omite.
        taxa_entrega_cliente: Number(s.saleGrossValue?.deliveryFee ?? 0),
        taxa_servico: Math.abs(Number(s.saleGrossValue?.serviceFee ?? 0)),
        tipo_entrega: s.delivery?.deliveryParameters?.logisticProvider ?? null,
        produto_logistico: s.delivery?.deliveryParameters?.deliveryProduct ?? null,
        canal_venda: s.salesChannel ?? null,
        forma_pagamento: metodos.join(" + ") || null,
        total_pago_cliente: Number(totalPago.toFixed(2)),
        synced_at: new Date().toISOString(),
      },
    ]
  })

  const admin = createAdminClient()
  let gravados = 0
  for (let i = 0; i < linhas.length; i += 500) {
    const lote = linhas.slice(i, i + 500)
    const { error } = await admin
      .from("ifood_pedidos")
      .upsert(lote, { onConflict: "unit_id,pedido_id" })
    if (error) {
      return {
        competencia,
        ok: false,
        vendas: vendas.length,
        gravados,
        erro: error.message,
      }
    }
    await marcarOrigemApi(unitId, lote.map((l) => l.pedido_id))
    gravados += lote.length
  }

  return { competencia, ok: true, vendas: vendas.length, gravados }
}
