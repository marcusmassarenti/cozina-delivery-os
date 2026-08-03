import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Conferência entre as duas fontes do mesmo pedido do iFood: a Conciliação que
 * o cliente sobe e os Financial Events que puxamos pela API.
 *
 * As duas nunca foram comparadas. A única vez que a comparação foi feita à mão
 * achou dois dias inteiros faltando no arquivo do cliente.
 *
 * A comparação é POR NÚMERO DO PEDIDO, não por dia — as duas fontes datam o
 * mesmo pedido de formas diferentes (a Conciliação usa a data do evento
 * financeiro, que empurra o pedido de domingo pra segunda). O detalhe está na
 * migration 0149, junto do que a verificação reprovou.
 *
 * 99 Food está de fora: os identificadores casam em quase toda a base, mas em
 * algumas lojas nenhum casa com os totais diários batendo exato — sinal de
 * vínculo `app_shop_id → loja` errado, não de pedido faltando. Incluir hoje
 * geraria alarme falso.
 */

export type ConferenciaLinha = {
  unitId: string
  unitCode: string
  unitName: string
  clienteNome: string
  pedidosApi: number
  pedidosPlanilha: number
  /** A API tem e a planilha não, no MIOLO do mês. É isto que merece alarme. */
  soApiMiolo: number
  /** A planilha tem e a API não, no miolo. Sugere sync parado nessa loja. */
  soPlanilhaMiolo: number
  /** Faltantes no 1º/último dia — evento financeiro na competência vizinha. */
  soApiBorda: number
  soPlanilhaBorda: number
  primeiroDiaFaltante: string | null
  provavelMotivo: string
}

type Row = {
  unit_id: string
  pedidos_api: number
  pedidos_planilha: number
  so_api_miolo: number
  so_planilha_miolo: number
  so_api_borda: number
  so_planilha_borda: number
  primeiro_dia_faltante: string | null
}

/**
 * Traduz os números numa frase acionável.
 *
 * A ordem dos testes importa: "planilha baixada antes do mês fechar" vem ANTES
 * de "arquivo incompleto". O caso mais comum é também o mais inofensivo, e um
 * alerta que exagera é um alerta que as pessoas param de ler.
 */
function explicar(l: ConferenciaLinha, ultimoDia: number): string {
  if (l.soApiMiolo === 0 && l.soPlanilhaMiolo === 0) return "Fecham."

  if (l.soApiMiolo > 0) {
    const dia = l.primeiroDiaFaltante
      ? Number(l.primeiroDiaFaltante.slice(8, 10))
      : null
    if (dia !== null && dia >= ultimoDia - 3) {
      return `${l.soApiMiolo} pedido(s) que a API tem não estão na planilha, a partir do dia ${dia} — provavelmente o arquivo foi baixado antes do mês fechar.`
    }
    return `${l.soApiMiolo} pedido(s) que a API tem não estão na planilha${
      dia !== null ? `, o primeiro no dia ${dia}` : ""
    }.`
  }

  return `${l.soPlanilhaMiolo} pedido(s) da planilha não vieram pela API — vale checar se o sync está rodando nesta loja.`
}

export async function conferirFontes(
  year: number,
  month: number,
): Promise<ConferenciaLinha[]> {
  const admin = createAdminClient()

  const { data, error } = await admin.rpc("conferencia_fontes_ifood", {
    p_year: year,
    p_month: month,
  })
  if (error) {
    // Erro aqui NÃO pode virar "nenhuma divergência": silêncio seria lido como
    // "está tudo certo", que é o oposto do que aconteceu.
    throw new Error(`conferirFontes: ${error.message}`)
  }

  const rows = (data ?? []) as Row[]
  if (rows.length === 0) return []

  // Nome do cliente e da loja pra mensagem ser acionável ("qual cliente, qual
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

  const ultimoDia = new Date(year, month, 0).getDate()

  const saida = rows.map((r) => {
    const m = meta.get(r.unit_id)
    const l: ConferenciaLinha = {
      unitId: r.unit_id,
      unitCode: m?.code ?? "?",
      unitName: m?.name ?? "(loja)",
      clienteNome: m?.cliente ?? "(cliente)",
      pedidosApi: r.pedidos_api,
      pedidosPlanilha: r.pedidos_planilha,
      soApiMiolo: r.so_api_miolo,
      soPlanilhaMiolo: r.so_planilha_miolo,
      soApiBorda: r.so_api_borda,
      soPlanilhaBorda: r.so_planilha_borda,
      primeiroDiaFaltante: r.primeiro_dia_faltante,
      provavelMotivo: "",
    }
    l.provavelMotivo = explicar(l, ultimoDia)
    return l
  })

  // Maior divergência primeiro — é por onde a leitura começa.
  saida.sort(
    (a, b) =>
      b.soApiMiolo + b.soPlanilhaMiolo - (a.soApiMiolo + a.soPlanilhaMiolo),
  )
  return saida
}
