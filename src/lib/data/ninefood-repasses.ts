/**
 * Depósitos do 99 que pagam as vendas de um período — "quando esse dinheiro
 * cai na conta".
 *
 * O DRE conta por DATA DA VENDA e o banco por DATA DO DEPÓSITO. O 99 paga toda
 * quarta a semana anterior, então no meio do mês metade do líquido ainda não
 * caiu, e o dono que compara as duas telas conclui que recebe menos do que
 * vende (Duéle / DG FOODS, 21/09/26). Este quadro põe as duas contas lado a
 * lado, com a data que o próprio 99 informa por pedido.
 *
 * Só loja conectada por API tem `expect_settle_date`. Sem ela a resposta é
 * `null` ("não sei"), nunca lista vazia, que diria "nada a receber".
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export type Deposito99 = {
  /** Data do depósito (YYYY-MM-DD). */
  deposito: string
  vendaDe: string
  vendaAte: string
  pedidos: number
  /** orderAmount dos pedidos válidos — o líquido que o DRE mostra. */
  liquido: number
  /** Repasse desses pedidos (sem vale-refeição, que vem por outro canal). */
  repasseVendas: number
  /** Cancelado depois de pronto que o 99 pagou mesmo assim. */
  canceladosPagos: number
  /** Estornos e reembolsos cobrados da loja (negativo). */
  ajustes: number
  /** Tudo que cai na conta nessa data por essas vendas. */
  total: number
  /** A data já passou (ou é hoje): o depósito já deveria estar na conta. */
  caiu: boolean
}

function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

export async function getDepositos99(
  unitId: string,
  de: string,
  ate: string,
): Promise<Deposito99[] | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc("ninefood_repasses_por_deposito", {
    p_unit_id: unitId,
    p_de: de,
    p_ate: ate,
  })
  // Falhou a leitura: o quadro some. Mostrar "nada a receber" seria afirmar
  // uma coisa que a gente não sabe.
  if (error) {
    console.error("getDepositos99:", error.message)
    return null
  }
  const rows = (data ?? []) as {
    deposito: string
    venda_de: string
    venda_ate: string
    pedidos: number
    liquido: number | string
    repasse_vendas: number | string
    cancelados_pagos: number | string
    ajustes: number | string
    total: number | string
  }[]
  if (rows.length === 0) return null
  const hoje = hojeSP()
  return rows.map((r) => ({
    deposito: r.deposito,
    vendaDe: r.venda_de,
    vendaAte: r.venda_ate,
    pedidos: Number(r.pedidos) || 0,
    liquido: Number(r.liquido) || 0,
    repasseVendas: Number(r.repasse_vendas) || 0,
    canceladosPagos: Number(r.cancelados_pagos) || 0,
    ajustes: Number(r.ajustes) || 0,
    total: Number(r.total) || 0,
    caiu: r.deposito <= hoje,
  }))
}
