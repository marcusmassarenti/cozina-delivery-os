import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Selo Super Restaurante: onde a loja está e o que falta.
 *
 * As metas são as do programa, conferidas no blog de parceiros do iFood
 * (blog-parceiros.ifood.com.br/super-restaurante-ifood). Ficam aqui, num
 * lugar só, porque são regra de negócio DELES: se mudarem, muda aqui e a
 * tela inteira acompanha.
 *
 * ⚠️ NÃO calculamos nada disso por conta própria, e é decisão consciente.
 * Medido em 10/08/26 na loja Hortolândia, mesma janela do iFood: nosso
 * extrato tinha 185 pedidos contra 217 e 33 avaliações contra 44, porque a
 * base tem buraco (julho com 9 dias de 31). Um acompanhamento "nosso"
 * reprovaria em dois critérios uma loja que o iFood aprova — e mostrar
 * "você perdeu o Super" pra quem não perdeu destrói a confiança na tela
 * inteira. Enquanto o buraco não fecha, o número exibido é o do iFood.
 */

export const METAS_SUPER = {
  /** Pedidos concluídos no trimestre. */
  pedidos: 180,
  /** Avaliações recebidas no trimestre. */
  avaliacoes: 40,
  /** Nota média mínima. */
  nota: 4.7,
  /** Cancelamento máximo, em %. */
  cancelamento: 1,
  /** Chamados por erro, máximo, em %. */
  chamados: 2.5,
} as const

export type CriterioSuper = {
  chave: "pedidos" | "avaliacoes" | "nota" | "cancelamento" | "chamados"
  rotulo: string
  valor: number | null
  meta: number
  /** true = quanto MENOR melhor (cancelamento, chamados). */
  menorMelhor: boolean
  atingido: boolean
  /**
   * Dentro da meta, mas por pouco — a menos de 10% de folga. É o estado que
   * interessa: quem já falhou não tem mais o que fazer neste ciclo; quem está
   * na borda ainda tem. Medido no 1º arquivo: São José dos Campos a 0,99% e
   * Jardins a 0,97%, com limite de 1%.
   */
  emRisco: boolean
  formato: "numero" | "nota" | "pct"
}

export type SuperCriterios = {
  unitId: string
  /** Selo oficial vigente (aba "Nível Atual"). */
  status: string | null
  eSuper: boolean
  eElegivel: boolean
  nivel: number | null
  periodoOficial: string | null
  /** Parcial rumo ao próximo dia 10 (aba "Próxima Avaliação"). */
  parcialAte: string | null
  criterios: CriterioSuper[]
  faltando: CriterioSuper[]
  emRisco: CriterioSuper[]
  /** Dias até o recálculo (dia 10 de cada mês). */
  diasAteRecalculo: number
}

type Linha = {
  unit_id: string
  tipo: string
  status: string | null
  e_super: boolean | null
  e_elegivel: boolean | null
  period_label: string | null
  period_end: string
  pedidos_concluidos: number | null
  total_pedidos: number | null
  pedidos_avaliados: number | null
  media_avaliacoes: number | string | null
  pct_cancelamento: number | string | null
  pct_chamados: number | string | null
}

/** "Nivel 5" → 5. Devolve null em "Nao elegivel". */
function nivelDe(status: string | null): number | null {
  const m = status?.match(/(\d+)/)
  return m ? Number(m[1]) : null
}

/**
 * Dias até o próximo dia 10 — a data em que o iFood recongela o selo.
 * No próprio dia 10 devolve 0: ainda dá, mas é hoje.
 */
export function diasAteRecalculo(hoje = new Date()): number {
  const d = hoje.getDate()
  if (d <= 10) return 10 - d
  const ultimoDia = new Date(
    hoje.getFullYear(),
    hoje.getMonth() + 1,
    0,
  ).getDate()
  return ultimoDia - d + 10
}

function montarCriterios(l: Linha): CriterioSuper[] {
  const num = (v: number | string | null) => (v == null ? null : Number(v))
  const def: Array<
    Omit<CriterioSuper, "atingido" | "emRisco"> & { menorMelhor: boolean }
  > = [
    {
      chave: "pedidos",
      rotulo: "Pedidos concluídos",
      // `total_pedidos` inclui cancelado — o critério é o concluído. Antes da
      // 0175 a coluna não existia; nas linhas velhas cai no total.
      valor: l.pedidos_concluidos ?? l.total_pedidos ?? null,
      meta: METAS_SUPER.pedidos,
      menorMelhor: false,
      formato: "numero",
    },
    {
      chave: "avaliacoes",
      rotulo: "Avaliações",
      valor: l.pedidos_avaliados ?? null,
      meta: METAS_SUPER.avaliacoes,
      menorMelhor: false,
      formato: "numero",
    },
    {
      chave: "nota",
      rotulo: "Nota média",
      valor: num(l.media_avaliacoes),
      meta: METAS_SUPER.nota,
      menorMelhor: false,
      formato: "nota",
    },
    {
      chave: "cancelamento",
      rotulo: "Cancelamento",
      valor: num(l.pct_cancelamento),
      meta: METAS_SUPER.cancelamento,
      menorMelhor: true,
      formato: "pct",
    },
    {
      chave: "chamados",
      rotulo: "Chamados por erro",
      valor: num(l.pct_chamados),
      meta: METAS_SUPER.chamados,
      menorMelhor: true,
      formato: "pct",
    },
  ]

  return def.map((c) => {
    if (c.valor == null) {
      return { ...c, atingido: false, emRisco: false }
    }
    const atingido = c.menorMelhor ? c.valor <= c.meta : c.valor >= c.meta
    // Folga de 10% da meta. Em cancelamento (limite 1%) isso é 0,9% — pega a
    // loja a um centésimo de estourar, que é exatamente o caso real.
    const folga = c.meta * 0.1
    const emRisco =
      atingido &&
      (c.menorMelhor ? c.valor >= c.meta - folga : c.valor <= c.meta + folga)
    return { ...c, atingido, emRisco }
  })
}

/**
 * Situação do Super por loja. Devolve só quem tem relatório importado —
 * loja sem dado fica de fora do Map, e a tela não mostra selo nenhum (em vez
 * de mostrar "não é Super", que seria afirmar o que não sabemos).
 */
export async function getSuperCriterios(
  unitIds: string[],
): Promise<Map<string, SuperCriterios>> {
  const out = new Map<string, SuperCriterios>()
  if (!unitIds.length) return out

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("ifood_super_avaliacao")
    .select(
      "unit_id, tipo, status, e_super, e_elegivel, period_label, period_end, pedidos_concluidos, total_pedidos, pedidos_avaliados, media_avaliacoes, pct_cancelamento, pct_chamados",
    )
    .in("unit_id", unitIds)
    .order("period_end", { ascending: false })

  if (error) {
    console.error("getSuperCriterios:", error.message)
    return out
  }

  // A mais recente de cada (loja, tipo). A consulta já vem ordenada, então a
  // primeira que aparece é a boa.
  const maisRecente = new Map<string, Linha>()
  for (const l of (data ?? []) as Linha[]) {
    const k = `${l.unit_id}:${l.tipo}`
    if (!maisRecente.has(k)) maisRecente.set(k, l)
  }

  const dias = diasAteRecalculo()
  for (const unitId of unitIds) {
    const atual = maisRecente.get(`${unitId}:atual`)
    const proxima = maisRecente.get(`${unitId}:proxima`)
    if (!atual && !proxima) continue

    // Os critérios saem do PARCIAL quando existe: é o que ainda dá pra mudar.
    // O selo e o nível continuam vindo do oficial — misturar os dois faria a
    // tela dizer "Nível 5" com números de outro período.
    const base = proxima ?? atual!
    const criterios = montarCriterios(base)
    const selo = atual ?? proxima!

    out.set(unitId, {
      unitId,
      status: selo.status,
      eSuper: selo.e_super === true,
      eElegivel: selo.e_elegivel === true,
      nivel: nivelDe(selo.status),
      periodoOficial: atual?.period_label ?? null,
      parcialAte: proxima?.period_end ?? null,
      criterios,
      faltando: criterios.filter((c) => !c.atingido),
      emRisco: criterios.filter((c) => c.emRisco),
      diasAteRecalculo: dias,
    })
  }
  return out
}
