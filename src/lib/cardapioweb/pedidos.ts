/**
 * Pedidos do Cardápio Web — busca e persistência.
 *
 * O desenho é ditado por uma limitação da API: NENHUMA listagem traz os
 * itens. Tanto `/orders` (polling) quanto `/orders/history` devolvem um
 * "LiteOrder" com 7 campos. Os itens só vêm em `GET /orders/{id}`, um
 * pedido por chamada, com teto de 300 req/3min por loja.
 *
 * Por isso o import tem dois tempos:
 *   1. `importarHistorico` varre o período e grava os CABEÇALHOS com
 *      detalhe_ok=false (barato: 1 chamada por 100 pedidos)
 *   2. `detalharPendentes` consome essa fila em lotes (caro: 1 por pedido)
 *
 * A tabela de pedidos É a fila. Se o job morrer no meio, o próximo começa
 * de onde parou — nada de recomeçar 6 meses do zero.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

import type { CwAmbiente, CwAuthMode } from "./auth"
import { fetchCw } from "./client"

export type CwInstall = {
  id: string
  ambiente: CwAmbiente
  authMode: CwAuthMode
  unitId: string | null
}

/** O que as listagens devolvem — sem itens, sem valores. */
type LiteOrder = {
  id: number | string
  status?: string | null
  order_type?: string | null
  order_timing?: string | null
  sales_channel?: string | null
  created_at?: string | null
  updated_at?: string | null
}

type CwOption = {
  option_id?: number | string | null
  external_code?: string | null
  name?: string | null
  quantity?: number | null
  unit_price?: number | null
  option_group_id?: number | string | null
  option_group_name?: string | null
}

type CwItem = {
  item_id?: number | string | null
  order_item_id?: number | string | null
  external_code?: string | null
  name?: string | null
  kind?: string | null
  status?: string | null
  quantity?: number | null
  unit_price?: number | null
  total_price?: number | null
  observation?: string | null
  user?: { id?: number | string; name?: string } | null
  options?: CwOption[] | null
  /** Combo: o item CONTÉM outros itens, cada um com suas próprias opções. */
  items?: CwItem[] | null
}

type CwDiscount = {
  kind?: string | null
  category?: string | null
  /** merchant = a loja bancou · ifood = a plataforma bancou */
  sponsorship?: string | null
  total?: number | null
  coupon_name?: string | null
  coupon_code?: string | null
  item_name?: string | null
}

type CwPayment = {
  total?: number | null
  payment_method?: string | null
  payment_type?: string | null
  payment_fee?: number | null
  card_brand?: string | null
  card_number?: string | null
  status?: string | null
}

export type CwOrder = LiteOrder & {
  display_id?: string | null
  external_order_id?: string | null
  external_display_id?: string | null
  delivered_by?: string | null
  customer_origin?: string | null
  cancellation_reason?: string | null
  observation?: string | null
  internal_observation?: string | null
  delivery_fee?: number | null
  service_fee?: number | null
  additional_fee?: number | null
  total?: number | null
  customer?: { id?: number | string; name?: string; phone?: string } | null
  delivery_address?: Record<string, unknown> | null
  items?: CwItem[] | null
  discounts?: CwDiscount[] | null
  payments?: CwPayment[] | null
}

type HistoryResponse = {
  orders?: LiteOrder[]
  pagination?: {
    current_page?: number
    total_pages?: number
    total_orders?: number
  }
}

const PER_PAGE = 100

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Teto das colunas de dinheiro do schema — numeric(12,2). */
const TETO_VALOR = 9_999_999_999.99

/**
 * Valor que não cabe na coluna NÃO pode virar null: isso apagaria dinheiro do
 * faturamento sem ninguém perceber. Falha com mensagem legível — o pedido fica
 * marcado com erro na tela (visível) e o total do mês segue confiável.
 *
 * Visto de verdade no sandbox: um pedido com delivery_fee = 8e19. O Postgres
 * respondia "numeric field overflow", que não diz nada a quem opera a loja.
 */
function conferirFaixa(campos: Record<string, number | null>): void {
  for (const [nome, v] of Object.entries(campos)) {
    if (v !== null && Math.abs(v) > TETO_VALOR) {
      throw new Error(
        `valor impossível no campo "${nome}" (${v.toExponential(2)}) — ` +
          `o Cardápio Web devolveu um número fora de qualquer faixa real`,
      )
    }
  }
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === "" ? null : s
}

/** Data em ISO com fuso, no formato que o /orders/history exige. */
export function isoComFuso(d: Date, fimDoDia = false): string {
  const iso = d.toISOString().slice(0, 10)
  return `${iso}T${fimDoDia ? "23:59:59" : "00:00:00"}-03:00`
}

// ─── 1) Cabeçalhos (barato) ─────────────────────────────────────────────

/**
 * Varre `/orders/history` no período e grava os cabeçalhos.
 *
 * Só traz `closed` e `canceled` — são os únicos status que o endpoint
 * aceita, e são justamente os que interessam pra leitura de dados
 * (pedido fechado é pedido que virou dinheiro; cancelado é a perda).
 *
 * Devolve quantos cabeçalhos novos entraram.
 */
export async function importarHistorico(
  install: CwInstall,
  inicio: Date,
  fim: Date,
): Promise<{ ok: boolean; paginas: number; pedidos: number; erro?: string }> {
  const admin = createAdminClient()
  let pagina = 1
  let totalPaginas = 1
  let gravados = 0

  while (pagina <= totalPaginas) {
    const res = await fetchCw<HistoryResponse>({
      installId: install.id,
      ambiente: install.ambiente,
      authMode: install.authMode,
      path: "/api/partner/v1/orders/history",
      // Teto apertado: 5 req/min. O cliente segura sozinho.
      tier: "lento",
      endpointLabel: "GET /orders/history",
      query: {
        start_date: isoComFuso(inicio),
        end_date: isoComFuso(fim, true),
        "status[]": "closed",
        per_page: PER_PAGE,
        page: pagina,
      },
    })

    if (!res.ok || !res.data) {
      return {
        ok: false,
        paginas: pagina - 1,
        pedidos: gravados,
        erro: res.error ?? `HTTP ${res.status}`,
      }
    }

    const orders = res.data.orders ?? []
    totalPaginas = res.data.pagination?.total_pages ?? 1

    if (orders.length > 0) {
      const linhas = orders.map((o) => {
        const criado = o.created_at ? new Date(o.created_at) : null
        return {
          install_id: install.id,
          unit_id: install.unitId,
          order_id: String(o.id),
          status: str(o.status),
          order_type: str(o.order_type),
          order_timing: str(o.order_timing),
          sales_channel: str(o.sales_channel),
          criado_em: o.created_at ?? null,
          atualizado_em: o.updated_at ?? null,
          ref_year: criado ? criado.getFullYear() : null,
          ref_month: criado ? criado.getMonth() + 1 : null,
        }
      })

      // Não sobrescreve detalhe já baixado: `ignoreDuplicates` mantém a
      // linha existente (com detalhe_ok=true) intacta.
      const { error } = await admin
        .from("cardapioweb_pedidos")
        .upsert(linhas, {
          onConflict: "install_id,order_id",
          ignoreDuplicates: true,
        })
      if (error) {
        return {
          ok: false,
          paginas: pagina,
          pedidos: gravados,
          erro: error.message,
        }
      }
      gravados += linhas.length
    }

    pagina++
  }

  return { ok: true, paginas: totalPaginas, pedidos: gravados }
}

// ─── 2) Detalhe (caro — 1 chamada por pedido) ───────────────────────────

/** Escolhe a forma de pagamento principal: a de maior valor. */
function pagamentoPrincipal(pagamentos: CwPayment[] | null | undefined) {
  if (!pagamentos || pagamentos.length === 0) return null
  return [...pagamentos].sort(
    (a, b) => (num(b.total) ?? 0) - (num(a.total) ?? 0),
  )[0]
}

/**
 * Grava o detalhe completo de um pedido: cabeçalho + itens + sub-itens de
 * combo + complementos.
 */
export async function gravarDetalhe(
  install: CwInstall,
  pedidoUuid: string,
  o: CwOrder,
): Promise<void> {
  const admin = createAdminClient()

  const descontos = o.discounts ?? []
  const somaSe = (fn: (d: CwDiscount) => boolean) =>
    descontos.filter(fn).reduce((s, d) => s + (num(d.total) ?? 0), 0)

  const pag = pagamentoPrincipal(o.payments)
  const criado = o.created_at ? new Date(o.created_at) : null

  conferirFaixa({
    "taxa de entrega": num(o.delivery_fee),
    "taxa de serviço": num(o.service_fee),
    "taxa adicional": num(o.additional_fee),
    total: num(o.total),
  })

  const { error: errPedido } = await admin
    .from("cardapioweb_pedidos")
    .update({
      display_id: str(o.display_id),
      external_order_id: str(o.external_order_id),
      external_display_id: str(o.external_display_id),
      status: str(o.status),
      order_type: str(o.order_type),
      order_timing: str(o.order_timing),
      sales_channel: str(o.sales_channel),
      delivered_by: str(o.delivered_by),
      customer_origin: str(o.customer_origin),
      customer_cw_id: o.customer?.id ? String(o.customer.id) : null,
      customer_nome: str(o.customer?.name),
      customer_telefone: str(o.customer?.phone),
      cancellation_reason: str(o.cancellation_reason),
      observation: str(o.observation),
      observacao_interna: str(o.internal_observation),
      delivery_fee: num(o.delivery_fee),
      service_fee: num(o.service_fee),
      additional_fee: num(o.additional_fee),
      total: num(o.total),
      desconto_total: somaSe(() => true),
      desconto_loja: somaSe((d) => d.sponsorship === "merchant"),
      desconto_plataforma: somaSe(
        (d) => !!d.sponsorship && d.sponsorship !== "merchant",
      ),
      forma_pagamento: str(pag?.payment_method),
      pagamento_tipo: str(pag?.payment_type),
      endereco: o.delivery_address ?? null,
      pagamentos: o.payments ?? null,
      descontos: o.discounts ?? null,
      criado_em: o.created_at ?? null,
      atualizado_em: o.updated_at ?? null,
      ref_year: criado ? criado.getFullYear() : null,
      ref_month: criado ? criado.getMonth() + 1 : null,
      detalhe_ok: true,
      detalhe_erro: null,
      raw: o as unknown as Record<string, unknown>,
      synced_at: new Date().toISOString(),
    })
    .eq("id", pedidoUuid)

  if (errPedido) throw new Error(errPedido.message)

  // Regrava os itens do zero (idempotente): o cascade limpa as opções.
  await admin
    .from("cardapioweb_pedido_itens")
    .delete()
    .eq("pedido_id", pedidoUuid)

  await inserirItens(install, pedidoUuid, o.items ?? [], null)
}

/**
 * Insere itens recursivamente. Combo vira pai + filhos: o `external_code`
 * de cada sub-item é o que amarra na ficha técnica, então não dá pra
 * guardar só o combo.
 */
async function inserirItens(
  install: CwInstall,
  pedidoUuid: string,
  itens: CwItem[],
  parentId: number | null,
): Promise<void> {
  const admin = createAdminClient()

  for (const it of itens) {
    const { data, error } = await admin
      .from("cardapioweb_pedido_itens")
      .insert({
        pedido_id: pedidoUuid,
        unit_id: install.unitId,
        parent_item_id: parentId,
        order_item_id: str(it.order_item_id),
        item_id: str(it.item_id),
        external_code: str(it.external_code),
        nome: str(it.name),
        kind: str(it.kind),
        status: str(it.status),
        quantidade: num(it.quantity),
        preco_unitario: num(it.unit_price),
        preco_total: num(it.total_price),
        observacao: str(it.observation),
        operador: str(it.user?.name),
      })
      .select("id")
      .single()

    if (error || !data) throw new Error(error?.message ?? "falha ao gravar item")
    const itemId = data.id as number

    const opcoes = it.options ?? []
    if (opcoes.length > 0) {
      const { error: errOpc } = await admin
        .from("cardapioweb_pedido_opcoes")
        .insert(
          opcoes.map((op) => ({
            item_id_fk: itemId,
            pedido_id: pedidoUuid,
            unit_id: install.unitId,
            option_id: str(op.option_id),
            external_code: str(op.external_code),
            nome: str(op.name),
            grupo_id: str(op.option_group_id),
            grupo_nome: str(op.option_group_name),
            quantidade: num(op.quantity),
            preco_unitario: num(op.unit_price),
          })),
        )
      if (errOpc) throw new Error(errOpc.message)
    }

    // Sub-itens do combo
    if (it.items && it.items.length > 0) {
      await inserirItens(install, pedidoUuid, it.items, itemId)
    }
  }
}

/**
 * Consome a fila de pedidos sem detalhe.
 *
 * `limite` existe pra caber no tempo de uma function: a 100 req/min, 80
 * pedidos levam ~50s. Chamar de novo continua de onde parou.
 */
export async function detalharPendentes(
  install: CwInstall,
  limite = 80,
): Promise<{ processados: number; erros: number; restantes: number }> {
  const admin = createAdminClient()

  const { data: pendentes } = await admin
    .from("cardapioweb_pedidos")
    .select("id, order_id")
    .eq("install_id", install.id)
    .eq("detalhe_ok", false)
    .lt("detalhe_tentativas", 3)
    .order("criado_em", { ascending: false })
    .limit(limite)

  let processados = 0
  let erros = 0

  for (const p of pendentes ?? []) {
    const res = await fetchCw<CwOrder>({
      installId: install.id,
      ambiente: install.ambiente,
      authMode: install.authMode,
      path: `/api/partner/v1/orders/${p.order_id}`,
      endpointLabel: "GET /orders/{id}",
    })

    if (!res.ok || !res.data) {
      erros++
      // Conta a tentativa: 3 falhas e o pedido sai da fila, pra um pedido
      // problemático não travar o backfill inteiro.
      await admin.rpc("cardapioweb_marcar_erro_detalhe", {
        p_pedido_id: p.id,
        p_erro: (res.error ?? `HTTP ${res.status}`).slice(0, 300),
      })
      continue
    }

    try {
      await gravarDetalhe(install, p.id as string, res.data)
      processados++
    } catch (e) {
      erros++
      await admin.rpc("cardapioweb_marcar_erro_detalhe", {
        p_pedido_id: p.id,
        p_erro: (e instanceof Error ? e.message : "erro ao gravar").slice(0, 300),
      })
    }
  }

  const { count } = await admin
    .from("cardapioweb_pedidos")
    .select("id", { count: "exact", head: true })
    .eq("install_id", install.id)
    .eq("detalhe_ok", false)
    .lt("detalhe_tentativas", 3)

  return { processados, erros, restantes: count ?? 0 }
}
