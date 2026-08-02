import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Conferência entre as duas fontes do mesmo pedido (API × planilha).
 *
 * NÃO julga: mede e devolve os dois lados. O corte do que é "divergência de
 * verdade" ainda não existe de propósito — vamos olhar a distribuição real na
 * base antes de escolher o limiar, em vez de eu chutar um número e calibrar o
 * alarme pelo palpite.
 *
 * Existe porque as duas fontes nunca foram comparadas, e a única vez que a
 * comparação foi feita — à mão — achou dois dias inteiros faltando na planilha
 * do cliente (2.832 pedidos na API contra 2.579 no arquivo).
 */

export type ConferenciaLinha = {
  unitId: string
  unitCode: string
  unitName: string
  clienteNome: string
  plataforma: "ifood" | "99food"
  pedidosApi: number
  pedidosPlanilha: number
  valorApi: number
  valorPlanilha: number
  /** Dias com pedido na API e NENHUM na planilha. O caso que mais acontece. */
  diasSoNaApi: string[]
  /** Dias com pedido na planilha e nenhum na API. Raro — merece olhar. */
  diasSoNaPlanilha: string[]
  /** Diferença de valor em % sobre o maior dos dois lados. */
  diffValorPct: number
  /** Leitura provável, pra não obrigar ninguém a interpretar número cru. */
  provavelMotivo: string
}

type Row = {
  unit_id: string
  plataforma: "ifood" | "99food"
  dia: string
  pedidos_api: number
  pedidos_planilha: number
  valor_api: number | string
  valor_planilha: number | string
}

/**
 * Explica a diferença em uma frase.
 *
 * A ordem importa: "planilha subida antes do fim do mês" tem que ser testada
 * ANTES de "arquivo incompleto", senão o caso mais comum e mais inofensivo
 * seria rotulado como o mais grave — e um alerta que exagera é um alerta que
 * as pessoas param de ler.
 */
function explicar(
  diasSoNaApi: string[],
  diasSoNaPlanilha: string[],
  diffPct: number,
  ultimoDiaDoMes: number,
): string {
  if (diasSoNaApi.length === 0 && diasSoNaPlanilha.length === 0) {
    if (diffPct < 1) return "Fecham. Diferença abaixo de 1%."
    return `Mesmos dias nas duas fontes, mas ${diffPct.toFixed(1)}% de diferença no valor.`
  }

  if (diasSoNaApi.length > 0) {
    const nums = diasSoNaApi.map((d) => Number(d.slice(8, 10))).sort((a, b) => a - b)
    const ehFinal = nums[nums.length - 1] >= ultimoDiaDoMes - 2
    const sequencia = nums[nums.length - 1] - nums[0] === nums.length - 1
    if (ehFinal && sequencia) {
      return `Planilha provavelmente baixada antes do mês fechar — faltam os dias ${nums.join(", ")}.`
    }
    return `Faltam ${nums.length} dia(s) na planilha (${nums.join(", ")}) que a API tem.`
  }

  return `A planilha tem ${diasSoNaPlanilha.length} dia(s) que a API não trouxe — vale checar se o sync está rodando nessa loja.`
}

export async function conferirFontes(
  year: number,
  month: number,
): Promise<ConferenciaLinha[]> {
  const admin = createAdminClient()

  const { data, error } = await admin.rpc("conferencia_fontes_por_dia", {
    p_year: year,
    p_month: month,
  })
  if (error) {
    // Erro aqui NÃO pode virar "nenhuma divergência" — silêncio seria lido
    // como "está tudo certo", que é o oposto do que aconteceu.
    throw new Error(`conferirFontes: ${error.message}`)
  }

  const rows = (data ?? []) as Row[]
  if (rows.length === 0) return []

  // Nome da loja e do cliente pra mensagem ser acionável ("qual cliente, qual
  // loja") em vez de devolver um uuid.
  const unitIds = [...new Set(rows.map((r) => r.unit_id))]
  const { data: units } = await admin
    .from("units")
    .select("id, code, name, brands(holdings(name))")
    .in("id", unitIds)
  const meta = new Map(
    (units ?? []).map((u) => {
      const b = u.brands as unknown as { holdings?: { name?: string } } | null
      return [
        u.id as string,
        {
          code: (u.code as string) ?? "?",
          name: (u.name as string) ?? "(loja)",
          cliente: b?.holdings?.name ?? "(cliente)",
        },
      ]
    }),
  )

  const ultimoDiaDoMes = new Date(year, month, 0).getDate()
  const porChave = new Map<string, ConferenciaLinha>()

  for (const r of rows) {
    const chave = `${r.unit_id}|${r.plataforma}`
    const m = meta.get(r.unit_id)
    let l = porChave.get(chave)
    if (!l) {
      l = {
        unitId: r.unit_id,
        unitCode: m?.code ?? "?",
        unitName: m?.name ?? "(loja)",
        clienteNome: m?.cliente ?? "(cliente)",
        plataforma: r.plataforma,
        pedidosApi: 0,
        pedidosPlanilha: 0,
        valorApi: 0,
        valorPlanilha: 0,
        diasSoNaApi: [],
        diasSoNaPlanilha: [],
        diffValorPct: 0,
        provavelMotivo: "",
      }
      porChave.set(chave, l)
    }
    l.pedidosApi += r.pedidos_api
    l.pedidosPlanilha += r.pedidos_planilha
    l.valorApi += Number(r.valor_api) || 0
    l.valorPlanilha += Number(r.valor_planilha) || 0
    if (r.pedidos_api > 0 && r.pedidos_planilha === 0) l.diasSoNaApi.push(r.dia)
    if (r.pedidos_planilha > 0 && r.pedidos_api === 0)
      l.diasSoNaPlanilha.push(r.dia)
  }

  const saida: ConferenciaLinha[] = []
  for (const l of porChave.values()) {
    // Só compara quem tem AS DUAS fontes. Loja que só sobe planilha (ou que só
    // tem API) apareceria como 100% divergente — e uma lista cheia de falso
    // positivo é uma lista que ninguém abre na segunda semana.
    if (l.pedidosApi === 0 || l.pedidosPlanilha === 0) continue

    const maior = Math.max(l.valorApi, l.valorPlanilha)
    l.diffValorPct =
      maior > 0 ? (Math.abs(l.valorApi - l.valorPlanilha) / maior) * 100 : 0
    l.diasSoNaApi.sort()
    l.diasSoNaPlanilha.sort()
    l.provavelMotivo = explicar(
      l.diasSoNaApi,
      l.diasSoNaPlanilha,
      l.diffValorPct,
      ultimoDiaDoMes,
    )
    saida.push(l)
  }

  // Maior diferença primeiro — é por onde a leitura começa.
  saida.sort(
    (a, b) =>
      b.diasSoNaApi.length + b.diasSoNaPlanilha.length -
        (a.diasSoNaApi.length + a.diasSoNaPlanilha.length) ||
      b.diffValorPct - a.diffValorPct,
  )
  return saida
}
