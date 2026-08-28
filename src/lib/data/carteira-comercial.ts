import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"

/**
 * O comercial da agência — T7.
 *
 * ⚠️ "FATURAMENTO" AQUI É MENSALIDADE VENDIDA, NÃO VENDA DE LOJA.
 *
 * A palavra é a mesma que o resto do sistema usa pro dinheiro que passa pelo
 * balcão do lojista, e são grandezas de ordens diferentes: uma loja fatura
 * R$ 250 mil e paga R$ 990 pra agência. Somar as duas, ou trocar uma pela
 * outra num gráfico, produz um número que ninguém consegue explicar depois.
 * Por isso a tela escreve "mensalidade vendida" por extenso em todo lugar.
 */

export type VendedorNoRanking = {
  id: string
  nome: string
  ativo: boolean
  lojas: number
  /** Soma das mensalidades das lojas que ele vendeu no período. */
  mensalidadeVendida: number
  /** Lojas sem mensalidade preenchida — entram na contagem, não na soma. */
  semValor: number
  ticketMedio: number
}

export type MesComercial = {
  mes: string
  rotulo: string
  vendas: number
  valor: number
}

export type PainelComercial = {
  vendedores: VendedorNoRanking[]
  meses: MesComercial[]
  totalVendas: number
  totalValor: number
  semVendedor: number
}

export async function painelComercial(periodo: {
  start: string
  end: string
}): Promise<PainelComercial> {
  const vazio: PainelComercial = {
    vendedores: [],
    meses: [],
    totalVendas: 0,
    totalValor: 0,
    semVendedor: 0,
  }
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return vazio
  const admin = createAdminClient()

  const [{ data: vendRaw }, { data: lojasRaw }] = await Promise.all([
    admin
      .from("vendedores")
      .select("id, nome, ativo")
      .eq("holding_id", holdingId)
      .order("nome"),
    admin
      .from("units")
      .select("id, vendedor_id, data_venda, mensalidade, brands!inner(holding_id)")
      .eq("brands.holding_id", holdingId)
      .not("data_venda", "is", null),
  ])

  const vendedores = (vendRaw ?? []) as { id: string; nome: string; ativo: boolean }[]
  const todas = (lojasRaw ?? []) as unknown as {
    id: string
    vendedor_id: string | null
    data_venda: string
    mensalidade: number | string | null
  }[]

  const noPeriodo = todas.filter(
    (l) => l.data_venda >= periodo.start && l.data_venda <= periodo.end,
  )
  const valor = (l: { mensalidade: number | string | null }) =>
    l.mensalidade === null ? null : Number(l.mensalidade)

  /* Inclui o vendedor SEM venda no período — some do ranking se a consulta
     partir das lojas, e some justamente quem precisa aparecer. Mesma regra
     do ranking de gestores. */
  const ranking: VendedorNoRanking[] = vendedores.map((v) => {
    const minhas = noPeriodo.filter((l) => l.vendedor_id === v.id)
    const comValor = minhas.map(valor).filter((n): n is number => n !== null)
    const soma = comValor.reduce((s, n) => s + n, 0)
    return {
      id: v.id,
      nome: v.nome,
      ativo: v.ativo,
      lojas: minhas.length,
      mensalidadeVendida: soma,
      semValor: minhas.length - comValor.length,
      /* Ticket sobre as lojas COM valor. Dividir pelo total daria um ticket
         menor a cada loja sem mensalidade preenchida — e o número cairia por
         falta de cadastro, não por venda pior. */
      ticketMedio: comValor.length > 0 ? soma / comValor.length : 0,
    }
  })
  ranking.sort((a, b) => b.mensalidadeVendida - a.mensalidadeVendida)

  // Evolução: 12 meses até o fim do período pedido.
  const fim = new Date(`${periodo.end}T12:00:00Z`)
  const meses: MesComercial[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth() - i, 1))
    const chave = d.toISOString().slice(0, 7)
    const doMes = todas.filter((l) => l.data_venda.slice(0, 7) === chave)
    meses.push({
      mes: chave,
      rotulo: d.toLocaleDateString("pt-BR", {
        month: "short",
        timeZone: "UTC",
      }),
      vendas: doMes.length,
      valor: doMes
        .map(valor)
        .filter((n): n is number => n !== null)
        .reduce((s, n) => s + n, 0),
    })
  }

  return {
    vendedores: ranking,
    meses,
    totalVendas: noPeriodo.length,
    totalValor: noPeriodo
      .map(valor)
      .filter((n): n is number => n !== null)
      .reduce((s, n) => s + n, 0),
    semVendedor: noPeriodo.filter((l) => !l.vendedor_id).length,
  }
}
