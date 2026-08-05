import "server-only"

/**
 * Distribuição dos pedidos por VALOR da taxa de entrega cobrada do cliente.
 *
 * Responde "quantos pedidos saíram a R$ 6,99, a R$ 7,99, de graça" e — o que
 * de fato decide preço — como o TICKET se comporta em cada faixa. Medido na JK:
 * R$ 55 de ticket na faixa de R$ 9,99 contra R$ 149 na de R$ 24,99. Quem mora
 * longe compra mais pra justificar o frete, e isso é argumento de precificação.
 *
 * ⚠️ FAIXA DE TAXA NÃO É RAIO. A mesma taxa cobre distâncias diferentes (na
 * configuração do iFood, 2,5 km e 3 km custam os dois R$ 6,99) e cada loja tem
 * a sua tabela. A tela precisa dizer isso: taxa é uma régua de distância torta,
 * não a distância.
 *
 * ⚠️ COBERTURA DESIGUAL, e é o ponto mais perigoso. No iFood a taxa vem
 * EXCLUSIVAMENTE da planilha de Pedidos — a API não entrega esse campo em
 * nenhum pedido (apurado em 05/ago: 0 de 20.552 linhas de API pura). Loja que
 * não sobe o relatório aparece com zero, e zero parece "não cobra frete" em vez
 * de "não importou". Por isso `cobertura` vem junto e a tela mostra sempre.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import type { PlatformId } from "@/components/platform-logo"

export type FaixaFrete = {
  plataforma: PlatformId
  /** Valor da taxa. 0 = frete grátis (é faixa, não ausência de dado). */
  taxa: number
  pedidos: number
  lojas: number
  /** Ticket médio dos pedidos daquela faixa. */
  ticket: number
  /** Total arrecadado de frete na faixa. */
  totalFrete: number
  /** Fatia dos pedidos da plataforma que caem nesta faixa. */
  pctPedidos: number
}

export type CoberturaPlataforma = {
  plataforma: PlatformId
  lojasComDado: number
  lojasQueUsam: number
  pedidos: number
}

export type RelatorioFrete = {
  faixas: FaixaFrete[]
  cobertura: CoberturaPlataforma[]
  totalPedidos: number
  totalFrete: number
  /** Pedidos com frete grátis, somando as plataformas. */
  pedidosGratis: number
}

type LinhaRpc = {
  plataforma: string
  taxa: number | string
  pedidos: number | string
  lojas: number | string
  receita_itens: number | string
  total_frete: number | string
}

const n = (v: number | string | null | undefined) => Number(v ?? 0)
const r2 = (v: number) => Math.round(v * 100) / 100

export async function getRelatorioFrete(
  unitIds: string[],
  inicio: string,
  fim: string,
): Promise<RelatorioFrete> {
  const vazio: RelatorioFrete = {
    faixas: [],
    cobertura: [],
    totalPedidos: 0,
    totalFrete: 0,
    pedidosGratis: 0,
  }
  if (unitIds.length === 0) return vazio

  const admin = createAdminClient()
  const [{ data, error }, { data: plats }] = await Promise.all([
    admin.rpc("frete_faixas_by_units", {
      p_unit_ids: unitIds,
      p_inicio: inicio,
      p_fim: fim,
    }),
    // Quantas lojas VENDEM em cada plataforma — denominador da cobertura.
    // Sem ele, "16 lojas com dado" não diz se faltam 3 ou 40. Foi exatamente o
    // que o selo do dashboard errava ao usar o total de lojas ativas.
    admin
      .from("unit_platforms")
      .select("unit_id, platform")
      .in("unit_id", unitIds)
      .eq("active", true),
  ])

  if (error) {
    console.error("getRelatorioFrete:", error.message)
    return vazio
  }

  const linhas = (data ?? []) as LinhaRpc[]
  const usam = new Map<string, number>()
  for (const p of (plats ?? []) as { platform: string }[]) {
    usam.set(p.platform, (usam.get(p.platform) ?? 0) + 1)
  }

  // Total de pedidos por plataforma — base do percentual de cada faixa.
  const porPlat = new Map<string, { pedidos: number; lojas: number }>()
  for (const l of linhas) {
    const cur = porPlat.get(l.plataforma) ?? { pedidos: 0, lojas: 0 }
    cur.pedidos += n(l.pedidos)
    cur.lojas = Math.max(cur.lojas, n(l.lojas))
    porPlat.set(l.plataforma, cur)
  }

  const faixas: FaixaFrete[] = linhas
    .map((l) => {
      const pedidos = n(l.pedidos)
      const totalPlat = porPlat.get(l.plataforma)?.pedidos ?? 0
      return {
        plataforma: l.plataforma as PlatformId,
        taxa: n(l.taxa),
        pedidos,
        lojas: n(l.lojas),
        // Ticket da faixa = receita dos itens ÷ pedidos. Calculado aqui e não
        // no banco pra não repetir a divisão em cada linha do SQL.
        ticket: pedidos > 0 ? r2(n(l.receita_itens) / pedidos) : 0,
        totalFrete: r2(n(l.total_frete)),
        pctPedidos: totalPlat > 0 ? r2((pedidos / totalPlat) * 100) : 0,
      }
    })
    // Por plataforma e, dentro dela, do frete mais barato pro mais caro: a
    // curva do ticket só faz sentido lida nessa ordem.
    .sort((a, b) =>
      a.plataforma === b.plataforma
        ? a.taxa - b.taxa
        : a.plataforma.localeCompare(b.plataforma),
    )

  const cobertura: CoberturaPlataforma[] = [...porPlat.entries()].map(
    ([plataforma, v]) => ({
      plataforma: plataforma as PlatformId,
      lojasComDado: v.lojas,
      lojasQueUsam: usam.get(plataforma) ?? v.lojas,
      pedidos: v.pedidos,
    }),
  )

  return {
    faixas,
    cobertura,
    totalPedidos: faixas.reduce((s, f) => s + f.pedidos, 0),
    totalFrete: r2(faixas.reduce((s, f) => s + f.totalFrete, 0)),
    pedidosGratis: faixas
      .filter((f) => f.taxa === 0)
      .reduce((s, f) => s + f.pedidos, 0),
  }
}
