import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Faturamento e pedidos por dia da semana.
 *
 * O sistema só tinha série mensal — dentro do mês, o dia da semana some. E é
 * ele que decide escala de equipe e onde colocar promoção: em julho/26 a rede
 * fez R$ 298 mil numa sexta contra R$ 197 mil numa terça, 34% de diferença.
 *
 * ⚠️ Cobre iFood e Cardápio Web. `ninefood_pedidos` e `keeta_pedidos` guardam
 * a data mas NÃO o valor do pedido — somar faturamento delas exigiria
 * inventar. Quem chama recebe `plataformas` pra dizer isso na tela.
 */

export type DiaSemana = {
  /** 0 = domingo (padrão do Postgres). */
  dow: number
  rotulo: string
  rotuloCurto: string
  pedidos: number
  valor: number
}

export type VendasPorDiaSemana = {
  dias: DiaSemana[]
  melhor: DiaSemana | null
  pior: DiaSemana | null
  total: number
  plataformas: string[]
}

const NOMES = [
  ["Domingo", "Dom"],
  ["Segunda-feira", "Seg"],
  ["Terça-feira", "Ter"],
  ["Quarta-feira", "Qua"],
  ["Quinta-feira", "Qui"],
  ["Sexta-feira", "Sex"],
  ["Sábado", "Sáb"],
] as const

export async function getVendasPorDiaSemana(
  unitIds: string[],
  inicio: string,
  fim: string,
): Promise<VendasPorDiaSemana> {
  const vazio: VendasPorDiaSemana = {
    dias: [],
    melhor: null,
    pior: null,
    total: 0,
    plataformas: ["iFood", "Cardápio Web"],
  }
  if (!unitIds.length) return vazio

  const { data, error } = await createAdminClient().rpc(
    "vendas_por_dia_semana",
    { p_unit_ids: unitIds, p_start: inicio, p_end: fim },
  )
  if (error) {
    console.error("getVendasPorDiaSemana:", error.message)
    return vazio
  }

  const porDow = new Map<number, { pedidos: number; valor: number }>()
  for (const r of (data ?? []) as Array<{
    dia_semana: number
    pedidos: number | string
    valor: number | string
  }>) {
    porDow.set(r.dia_semana, {
      pedidos: Number(r.pedidos),
      valor: Number(r.valor),
    })
  }

  // Semana começando na SEGUNDA: é como a operação lê a escala. O Postgres
  // devolve 0=domingo, e mostrar domingo primeiro faz o fim de semana parecer
  // duas pontas soltas do gráfico.
  const ordem = [1, 2, 3, 4, 5, 6, 0]
  const dias: DiaSemana[] = ordem.map((dow) => ({
    dow,
    rotulo: NOMES[dow]![0],
    rotuloCurto: NOMES[dow]![1],
    pedidos: porDow.get(dow)?.pedidos ?? 0,
    valor: porDow.get(dow)?.valor ?? 0,
  }))

  // Dia sem venda nenhuma fica FORA do melhor/pior: numa loja que não abre
  // segunda, "o pior dia é segunda com R$ 0" é obvio e inútil.
  const comVenda = dias.filter((d) => d.valor > 0)
  const porValor = [...comVenda].sort((a, b) => b.valor - a.valor)

  return {
    dias,
    melhor: porValor[0] ?? null,
    pior: porValor[porValor.length - 1] ?? null,
    total: dias.reduce((s, d) => s + d.valor, 0),
    plataformas: ["iFood", "Cardápio Web"],
  }
}
