import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Repasses do iFood de UMA loja, pro card "Recebíveis · quando cai".
 *
 * ── POR QUE O iFOOD FICAVA DE FORA (e por que não precisa mais) ──────────
 * O card dizia "o iFood não disponibiliza o repasse em relatório" — verdade
 * pro extrato, que só tem o calendário ORIGINAL de pagamento. Mas desde
 * 26/08/26 o cron `ifood-repasses` grava `ifood_repasses` a partir da API de
 * ANTECIPAÇÕES (+ Settlements pros ciclos não antecipados), com a data em que
 * o dinheiro caiu de verdade e a taxa da antecipação — conferido ao centavo
 * contra o portal e o extrato bancário na JK. O dado existia; só o card não
 * lia (Marcus, 25/09/26: "é essencial para nosso cliente").
 *
 * O ciclo entra quando as VENDAS dele caem no período da tela (a mesma
 * pergunta do 99: "quando cai o dinheiro dessas vendas"), não quando o
 * pagamento cai.
 *
 * ⚠️ SÓ CICLO FECHADO. A semana em andamento não existe na API até o iFood
 * fechar o ciclo (domingo); o card diz isso em vez de estimar — estimar pelo
 * extrato erraria o valor de quem antecipa (a taxa só aparece no fechamento).
 */

export type CicloIfood = {
  inicio: string
  fim: string
  valorBruto: number
  taxaAntecipacao: number
  liquido: number
  /** Data do calendário original (antes de antecipar). */
  dataPrevista: string | null
  /** Data em que o dinheiro cai/caiu de fato. */
  dataPagamento: string | null
  caiu: boolean
}

export type RepassesIfood = {
  ciclos: CicloIfood[]
  /** Vendas do período que ainda estão num ciclo aberto (sem valor/data). */
  cicloAbertoDesde: string | null
}

function hojeBR(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(),
  )
}

function diaSeguinte(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export async function getRepassesIfood(
  unitId: string,
  de: string,
  ate: string,
): Promise<RepassesIfood | null> {
  const { data, error } = await createAdminClient()
    .from("ifood_repasses")
    .select(
      "ciclo_inicio, ciclo_fim, valor_bruto, taxa_antecipacao, valor_liquido, data_prevista, data_pagamento",
    )
    .eq("unit_id", unitId)
    .lte("ciclo_inicio", ate)
    .gte("ciclo_fim", de)
    .order("ciclo_inicio")
  if (error) {
    console.error("getRepassesIfood:", error.message)
    return null
  }
  const hoje = hojeBR()
  const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100
  const ciclos: CicloIfood[] = (
    (data ?? []) as {
      ciclo_inicio: string
      ciclo_fim: string
      valor_bruto: number | string
      taxa_antecipacao: number | string
      valor_liquido: number | string
      data_prevista: string | null
      data_pagamento: string | null
    }[]
  ).map((c) => ({
    inicio: c.ciclo_inicio,
    fim: c.ciclo_fim,
    valorBruto: r2(c.valor_bruto),
    taxaAntecipacao: r2(c.taxa_antecipacao),
    liquido: r2(c.valor_liquido),
    dataPrevista: c.data_prevista,
    dataPagamento: c.data_pagamento,
    caiu: !!c.data_pagamento && c.data_pagamento <= hoje,
  }))

  // Sem ciclo nenhum = loja sem repasse do iFood pela API: o card não mostra
  // a aba (não é "ciclo aberto", é "não temos esse dado").
  if (ciclos.length === 0) return { ciclos, cicloAbertoDesde: null }

  // Venda depois do último ciclo fechado, dentro do período e até hoje:
  // está na semana aberta — o card avisa em vez de inventar número.
  const ultimoFim = ciclos.reduce((m, c) => (c.fim > m ? c.fim : m), ciclos[0].fim)
  const limite = ate < hoje ? ate : hoje
  const desde = diaSeguinte(ultimoFim)
  return { ciclos, cicloAbertoDesde: desde <= limite ? desde : null }
}
