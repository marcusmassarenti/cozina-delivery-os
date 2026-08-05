/**
 * Sync de PEDIDOS/PAGAMENTO do iFood via API (Financial Events).
 *
 * Substitui o "Relatório de pedidos (VR)" — o último relatório iFood que a
 * operação subia à mão, 1 arquivo por loja. O endpoint Financial Events já era
 * chamado pelo cron e o retorno era jogado fora; agora o evento ORDER_PAYMENT
 * (que traz payment.method, payment.brand e amount.value por pedido) vira linha
 * em `ifood_pedidos`.
 *
 * Provado contra o arquivo manual (JK, jun/26, mesma janela): mix de pagamento
 * 99,8% igual, VR por bandeira exato, e `amount.value` == "total pago pelo
 * cliente" ao centavo. No mês cheio a API ainda achou 253 pedidos que faltavam
 * no arquivo (dias 29-30 não tinham sido exportados).
 *
 * ⚠️ Grava SÓ as colunas que a API conhece. As que só a planilha tem
 * (valor_itens, valor_liquido, turno, incentivos, taxas, tipo_entrega,
 * produto_logistico, canal_venda) ficam FORA do payload — senão o upsert
 * passaria NULL por cima do dado do import (o mesmo bug que apagou as tags das
 * avaliações).
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

import {
  fetchAllFinancialEvents,
  MAX_PAGE_SIZE,
  type IfoodFinancialEvent,
} from "./events"

/** Evento que carrega o pagamento do pedido. */
const EVENTO_PAGAMENTO = "ORDER_PAYMENT"

/**
 * payment.method da API → o mesmo vocabulário de grupo que o parser da
 * planilha usa (`normalizaPagamento` em parse-pedidos.ts), pra as telas de
 * pagamento não verem diferença entre origem API e origem planilha.
 */
function grupoDoMethod(method: string): string {
  switch (method) {
    case "MEAL_VOUCHER":
    case "OTHER_VOUCHER":
      return "Vale-Refeição"
    case "CREDIT":
      return "Crédito"
    case "DEBIT":
      return "Débito"
    case "PIX":
      return "PIX"
    case "DIGITAL_WALLET":
      return "Carteira"
    default:
      // BANK_PAY (app do banco), VOUCHER (cupom) e o que vier de novo.
      return "Outros"
  }
}

/**
 * payment.brand da API → bandeira no vocabulário da planilha. A API é mais
 * granular que o relatório (IFOOD_MEAL_VOUCHER, IFOOD_FOODMEAL_VOUCHER,
 * IFOOD_REWARD_VOUCHER, IFOOD_COMERNOIFOOD_VOUCHER); o relatório junta os três
 * últimos em "Outros vales". Como as telas já agrupam por este vocabulário,
 * normalizamos — a bandeira crua fica preservada na coluna `bandeira`.
 */
function bandeiraVrDoBrand(brand: string | null): string {
  const b = (brand ?? "").toUpperCase()
  if (!b) return "OUTROS"
  if (b.includes("SODEXO")) return "SODEXO"
  if (b.includes("ALELO")) return "ALELO"
  if (b.includes("TICKET")) return "TICKET"
  if (b.startsWith("IFOOD") || b.includes("MEAL")) return "IFOOD"
  if (b === "VR" || b.startsWith("VR")) return "VR"
  return "OUTROS"
}

/** Prioridade quando o pedido foi pago com mais de um meio (raro: ~0,4%). */
const PRIORIDADE = [
  "Vale-Refeição",
  "Crédito",
  "Débito",
  "PIX",
  "Carteira",
  "Outros",
]

type PedidoAgregado = {
  pedidoId: string
  data: string // YYYY-MM-DD
  horario: string | null
  valor: number
  metodos: Set<string>
  brands: Set<string>
  /** Bandeira do voucher, quando houve pagamento em vale. */
  brandVoucher: string | null
}

/** Junta os eventos ORDER_PAYMENT num registro por pedido. */
export function agregarPorPedido(
  eventos: IfoodFinancialEvent[],
): PedidoAgregado[] {
  const porPedido = new Map<string, PedidoAgregado>()
  for (const e of eventos) {
    if (e.name !== EVENTO_PAGAMENTO) continue
    const id = e.reference?.id
    if (!id) continue
    const iso = e.reference?.date ?? ""
    let cur = porPedido.get(id)
    if (!cur) {
      cur = {
        pedidoId: id,
        data: iso.slice(0, 10),
        horario: iso || null,
        valor: 0,
        metodos: new Set(),
        brands: new Set(),
        brandVoucher: null,
      }
      porPedido.set(id, cur)
    }
    cur.valor += Number(e.amount?.value ?? 0)
    const m = e.payment?.method
    const b = e.payment?.brand
    if (m) cur.metodos.add(m)
    if (b) cur.brands.add(b)
    // Num pedido combinado (ex.: vale + crédito) a bandeira que interessa pro
    // VR é a do vale — guardamos separado pra não pegar a do cartão.
    if (b && (m === "MEAL_VOUCHER" || m === "OTHER_VOUCHER")) {
      cur.brandVoucher = b
    }
  }
  return [...porPedido.values()].filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.data))
}

/** Linha pronta pro upsert em `ifood_pedidos` (só colunas da API). */
function paraLinha(unitId: string, p: PedidoAgregado) {
  const grupos = [...p.metodos].map(grupoDoMethod)
  const grupo =
    PRIORIDADE.find((g) => grupos.includes(g)) ?? grupos[0] ?? "Outros"
  const ehVale = grupo === "Vale-Refeição"
  const [ano, mes] = p.data.split("-").map(Number)
  // Bandeira crua: a do vale quando houve vale; senão a do cartão.
  const brandCru = p.brandVoucher ?? [...p.brands][0] ?? null

  return {
    unit_id: unitId,
    pedido_id: p.pedidoId,
    data: p.data,
    horario: p.horario,
    ref_year: ano,
    ref_month: mes,
    total_pago_cliente: Number(p.valor.toFixed(2)),
    forma_pagamento: [...p.metodos].sort().join(" + ") || null,
    forma_grupo: grupo,
    bandeira: brandCru,
    bandeira_vr: ehVale ? bandeiraVrDoBrand(p.brandVoucher) : null,
    synced_at: new Date().toISOString(),
    // NÃO mandar: valor_itens, valor_liquido, turno, status_final, incentivo_*,
    // taxa_*, taxas_comissoes, tipo_entrega, produto_logistico, canal_venda,
    // pedido_id_curto — são da planilha; incluí-los apagaria o dado dela.
    //
    // `source` também NÃO entra, pelo mesmo motivo — e essa faltou na primeira
    // versão. Pedido que veio da planilha e depois foi tocado por este sync
    // virava source='api' mantendo a taxa, o valor dos itens e o tipo de
    // entrega que SÓ a planilha traz. Resultado: uma linha que dizia ser da
    // API exibindo dado que a API não tem. Chega a enganar quem investiga —
    // olhando "% de linhas api com taxa" a conclusão foi "a API traz 31%",
    // quando a resposta certa é ZERO. Ver marcarOrigemApi abaixo.
  }
}

/**
 * Marca como 'api' só o que a API de fato originou.
 *
 * A coluna nasce com default 'report', então a linha nova inserida por este
 * sync precisa ser corrigida logo depois. E a linha que TEM import_id veio de
 * planilha — essa fica como está, senão a origem do dado vira ficção.
 */
async function marcarOrigemApi(unitId: string, pedidoIds: string[]) {
  if (pedidoIds.length === 0) return
  await createAdminClient()
    .from("ifood_pedidos")
    .update({ source: "api" })
    .eq("unit_id", unitId)
    .in("pedido_id", pedidoIds)
    .is("import_id", null)
    .neq("source", "api")
}

/** Primeiro e último dia de uma competência YYYY-MM. */
function limitesDoMes(competencia: string): { inicio: string; fim: string } {
  const [ano, mes] = competencia.split("-").map(Number)
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  return {
    inicio: `${competencia}-01`,
    fim: `${competencia}-${String(ultimo).padStart(2, "0")}`,
  }
}

/**
 * Quebra o mês em janelas de no máximo 33 dias (limite do iFood). Um mês cabe
 * numa janela só, mas a função deixa isso explícito e serve pra backfill.
 */
function janelas(inicio: string, fim: string, maxDias = 31): [string, string][] {
  const out: [string, string][] = []
  const ini = new Date(inicio + "T00:00:00Z")
  const end = new Date(fim + "T00:00:00Z")
  let cur = ini
  while (cur <= end) {
    const prox = new Date(cur)
    prox.setUTCDate(prox.getUTCDate() + maxDias - 1)
    const ate = prox > end ? end : prox
    out.push([
      cur.toISOString().slice(0, 10),
      ate.toISOString().slice(0, 10),
    ])
    cur = new Date(ate)
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

export type PedidosSyncCompetencia = {
  competencia: string
  ok: boolean
  eventos: number
  pedidos: number
  gravados: number
  erro?: string
}

/**
 * Sincroniza os pedidos de UMA loja numa competência (YYYY-MM).
 * Idempotente: upsert por (unit_id, pedido_id).
 */
export async function syncPedidosDaLoja(
  unitId: string,
  merchantId: string,
  competencia: string,
): Promise<PedidosSyncCompetencia> {
  const { inicio, fim } = limitesDoMes(competencia)
  let eventos: IfoodFinancialEvent[] = []

  for (const [de, ate] of janelas(inicio, fim)) {
    // Página no teto da API (300) — uma loja grande faz ~22 mil eventos/mês,
    // então de 100 em 100 seriam 3× mais chamadas.
    const r = await fetchAllFinancialEvents(merchantId, de, ate, {
      size: MAX_PAGE_SIZE,
      maxPages: 400,
    })
    if (!r.ok) {
      return {
        competencia,
        ok: false,
        eventos: 0,
        pedidos: 0,
        gravados: 0,
        erro: r.error ?? `HTTP ${r.lastStatus ?? r.firstStatus ?? "?"}`,
      }
    }
    eventos = eventos.concat(r.events)
  }

  const pedidos = agregarPorPedido(eventos)
  if (pedidos.length === 0) {
    return { competencia, ok: true, eventos: eventos.length, pedidos: 0, gravados: 0 }
  }

  const admin = createAdminClient()
  const linhas = pedidos.map((p) => paraLinha(unitId, p))
  let gravados = 0
  // Lotes de 500 — a JK sozinha faz ~2.800 pedidos/mês.
  for (let i = 0; i < linhas.length; i += 500) {
    const lote = linhas.slice(i, i + 500)
    const { error } = await admin
      .from("ifood_pedidos")
      .upsert(lote, { onConflict: "unit_id,pedido_id" })
    if (!error) await marcarOrigemApi(unitId, lote.map((l) => l.pedido_id))
    if (error) {
      return {
        competencia,
        ok: false,
        eventos: eventos.length,
        pedidos: pedidos.length,
        gravados,
        erro: error.message,
      }
    }
    gravados += lote.length
  }

  return {
    competencia,
    ok: true,
    eventos: eventos.length,
    pedidos: pedidos.length,
    gravados,
  }
}

/**
 * Registra a sincronização no Histórico de Importações (mesma pegada das
 * avaliações), pra a loja ver que o dado entrou sozinho.
 */
export async function logPedidosSync(
  unitId: string,
  competencia: string,
  linhas: number,
): Promise<void> {
  const [ano, mes] = competencia.split("-").map(Number)
  const admin = createAdminClient()
  const { error } = await admin.from("platform_imports").insert({
    unit_id: unitId,
    platform: "ifood",
    report_type: "pedidos",
    cadencia: "mensal",
    source: "api",
    source_filename: "API — pedidos/pagamento (sync automático)",
    rows_imported: linhas,
    ref_year: ano,
    ref_month: mes,
    status: "success",
  })
  if (error) console.error("pedidos-sync log:", error.message)
}
