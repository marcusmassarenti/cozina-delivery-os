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

/**
 * Quanto de folga ainda conta como "no limite", POR CRITÉRIO.
 *
 * ⚠️ Era 10% da meta pra todos, e isso quebrava na nota: 10% de 4,7 é 0,47,
 * então tudo até 5,17 entrava — e como a nota máxima é 5, TODA loja aparecia
 * como em risco. Marcus viu na tela: Brooklin com 4,9 e JK com 4,8 listadas
 * como "prestes a perder", que é o oposto da verdade.
 *
 * Escala limitada (nota 0–5) pede margem absoluta; contagem sem teto (pedidos)
 * aceita margem proporcional. Não dá pra usar a mesma régua nos dois.
 */
const FOLGA_RISCO = {
  /** 10% acima do mínimo: 180–198 pedidos. */
  pedidos: 18,
  /** 40–44 avaliações. */
  avaliacoes: 4,
  /** 4,70–4,74. Meio décimo já é uma nota ruim de diferença. */
  nota: 0.05,
  /** 0,90%–1,00%. */
  cancelamento: 0.1,
  /** 2,25%–2,50%. */
  chamados: 0.25,
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

/**
 * Valor de um critério em pt-BR. Vive junto do tipo porque tela nenhuma
 * deveria reimplementar isso — foi assim que "4.7" com ponto apareceu numa
 * etiqueta enquanto a tabela ao lado mostrava "4,7".
 */
export function fmtCriterio(
  valor: number | null,
  formato: CriterioSuper["formato"],
): string {
  if (valor == null) return "—"
  if (formato === "pct")
    return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
  if (formato === "nota")
    return valor.toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })
  return valor.toLocaleString("pt-BR")
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
  /** Recomendação do próprio iFood ("Manter os indicadores", etc.). */
  planoDeAcao: string | null
  /**
   * Dimensões que o cliente elogiou / reclamou, com a contagem. É o que diz
   * POR QUE a nota é o que é: "aparência" e "embalagem" são problemas
   * diferentes, com donos diferentes na operação.
   */
  tagsPos: Record<string, number>
  tagsNeg: Record<string, number>
  /** Chamados por natureza: atraso é entrega, item errado é cozinha. */
  chamados: {
    total: number
    atraso: number
    posEntrega: number
    itemErrado: number
  }
  /**
   * Colunas do relatório que não são critério, mas explicam o critério.
   *
   * `totalPedidos` inclui cancelado e `pedidosConcluidos` não — a diferença
   * entre os dois É o volume cancelado. E `cancelamentosDaLoja` separa o que
   * foi responsabilidade da loja do cancelamento total: só o primeiro conta
   * contra o selo.
   */
  totalPedidos: number
  cancelamentosDaLoja: number
}

/** `{ "bem temperada": 37 }` — jsonb solto do banco vira mapa tipado. */
function mapaTags(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object") return {}
  const out: Record<string, number> = {}
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    const q = Number(n)
    if (Number.isFinite(q) && q > 0) out[k] = q
  }
  return out
}
const tagsDe = (l: Linha) => mapaTags(l.tags_pos)
const tagsDeNeg = (l: Linha) => mapaTags(l.tags_neg)

type Linha = {
  unit_id: string
  tipo: string
  plano_de_acao: string | null
  tags_pos: unknown
  tags_neg: unknown
  total_chamados: number | null
  cancelamentos_da_loja: number | null
  chamados_atraso: number | null
  chamados_pos_entrega: number | null
  chamados_item_errado: number | null
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
    const folga = FOLGA_RISCO[c.chave]
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
      "unit_id, tipo, status, e_super, e_elegivel, period_label, period_end, pedidos_concluidos, total_pedidos, pedidos_avaliados, media_avaliacoes, pct_cancelamento, pct_chamados, cancelamentos_da_loja, plano_de_acao, tags_pos, tags_neg, total_chamados, chamados_atraso, chamados_pos_entrega, chamados_item_errado",
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
      planoDeAcao: base.plano_de_acao,
      tagsPos: tagsDe(base),
      tagsNeg: tagsDeNeg(base),
      chamados: {
        total: base.total_chamados ?? 0,
        atraso: base.chamados_atraso ?? 0,
        posEntrega: base.chamados_pos_entrega ?? 0,
        itemErrado: base.chamados_item_errado ?? 0,
      },
      totalPedidos: base.total_pedidos ?? 0,
      cancelamentosDaLoja: base.cancelamentos_da_loja ?? 0,
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
