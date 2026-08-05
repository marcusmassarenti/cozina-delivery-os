import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Último dia do mês que tem QUALQUER movimento das lojas — em qualquer
 * plataforma.
 *
 * Existe por causa de um susto real: em 05/08/26 o painel da rede mostrava
 * -30% no faturamento e -35% nos pedidos. Não tinha caído nada disso. O dia 05
 * simplesmente ainda não tinha entrado (importação e cron rodam sobre o dia
 * anterior), mas o corte do comparativo era `hoje`, então o mês atual somava 4
 * dias de venda e era dividido/comparado como se fossem 5. A queda real era de
 * 12%; os outros 18 pontos eram um dia vazio contado como dia de venda zero.
 *
 * Serve pra duas contas do dashboard:
 *   - a média por dia (divisor);
 *   - o recorte do mês anterior, pra comparar o mesmo número de dias.
 *
 * Uma consulta por plataforma, todas em paralelo, cada uma sendo um
 * `order + limit 1` sobre índice — o dia mais recente de cada fonte. Devolve o
 * MAIOR entre elas: se só o 99 já entrou hoje, o dia conta.
 *
 * Devolve `null` quando não há dado nenhum no mês; quem chama decide o
 * fallback (o dashboard mantém o dia de hoje, que é o comportamento antigo).
 */
export async function ultimoDiaComDado(
  unitIds: string[],
  year: number,
  month: number,
): Promise<number | null> {
  if (unitIds.length === 0) return null
  const admin = createAdminClient()
  const mm = String(month).padStart(2, "0")
  const ini = `${year}-${mm}-01`
  const fim = `${year}-${mm}-31`

  const ultimo = async (
    tabela: string,
    coluna: string,
  ): Promise<number | null> => {
    const { data, error } = await admin
      .from(tabela)
      .select(coluna)
      .in("unit_id", unitIds)
      .gte(coluna, ini)
      .lte(coluna, `${fim}T23:59:59`)
      .order(coluna, { ascending: false })
      .limit(1)
      .maybeSingle()
    // Erro aqui NÃO pode derrubar o dashboard: no pior caso volta null e o
    // corte cai no comportamento antigo. Uma tela que não abre é pior que uma
    // seta imprecisa.
    if (error || !data) return null
    const iso = String((data as unknown as Record<string, unknown>)[coluna] ?? "")
    const dia = Number(iso.slice(8, 10))
    return Number.isFinite(dia) && dia > 0 ? dia : null
  }

  // O 99 é o único que não guarda unit_id: a chave dele é o app_shop_id, e a
  // ponte mora em ninefood_store_links. Filtrar por unidade exige resolver os
  // shops antes — sem isso a consulta olharia a base inteira e o "último dia"
  // de um cliente contaminaria o painel de outro.
  const ultimo99 = async (): Promise<number | null> => {
    const { data: links } = await admin
      .from("ninefood_store_links")
      .select("app_shop_id")
      .in("unit_id", unitIds)
    const shops = (links ?? [])
      .map((l) => l.app_shop_id as string)
      .filter(Boolean)
    if (shops.length === 0) return null
    const { data } = await admin
      .from("ninefood_api_bill")
      .select("business_date")
      .in("app_shop_id", shops)
      .gte("business_date", ini)
      .lte("business_date", fim)
      .order("business_date", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data?.business_date) return null
    const dia = Number(String(data.business_date).slice(8, 10))
    return Number.isFinite(dia) && dia > 0 ? dia : null
  }

  const dias = await Promise.all([
    // Fonte do dinheiro do iFood — a mesma que alimenta os cards.
    ultimo("ifood_financeiro_lancamentos", "data_fato_gerador"),
    ultimo99(),
    ultimo("keeta_pedidos", "data"),
    ultimo("cardapioweb_pedidos", "criado_em"),
  ])

  const validos = dias.filter((d): d is number => d !== null)
  return validos.length > 0 ? Math.max(...validos) : null
}
