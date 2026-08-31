import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Merchants IRMÃOS no iFood — mesma razão social, mesma cidade.
 *
 * ── POR QUE ISTO EXISTE (31/08/26) ──────────────────────────────────────
 * A Varginha (Churrasco Royal) passou nove dias vinculada ao cadastro errado.
 * A CLUBE DA GASTRONOMIA LTDA tem DOIS merchants em VARGINHA/MG, com nomes
 * que diferem por uma palavra:
 *
 *   "Churrasco Royal - Carnes Bbq e Comida"
 *   "Churrasco Royal - Carnes Bbq e Comida Brasileira"
 *
 * O primeiro foi o único que a autorização de 22/08 liberou, então foi o
 * escolhido — corretamente, porque o outro não existia na lista. Resultado:
 * o sistema mostrou R$ 93,98 de faturamento numa loja que fez R$ 16.911,60.
 *
 * ── POR QUE NÃO É "A LOJA FATURA POUCO" ─────────────────────────────────
 * Foi a primeira ideia e a medição derrubou: comparar cada loja com a mediana
 * do cliente acusa 15 lojas, e a maioria é loja pequena legítima — a Ki
 * Delicia faz 77 pedidos no mês, a Bello Marmitaria 104. Faturamento baixo
 * não é sinal de vínculo errado, é sinal de loja menor.
 *
 * O sinal específico é a DUPLICIDADE: quando existe mais de um cadastro da
 * mesma empresa na mesma cidade e nem todos estão vinculados, o que está
 * vinculado pode ser o errado. Medido na base inteira, isso dá quatro grupos
 * — e só dois têm irmão solto, que são exatamente os dois casos reais
 * (Varginha e as duas do Grupo Le Brunch esperando cadastro). Os outros dois
 * têm todos os irmãos vinculados e não aparecem.
 *
 * ⚠️ É ALERTA DE CONFERÊNCIA, não de erro. Duas lojas da mesma empresa na
 * mesma cidade existem de verdade — a Yakisushi tem duas em Presidente
 * Prudente. O que o alerta diz é "vale olhar", e é por isso que ele mostra o
 * faturamento do vinculado: é o número que decide.
 */

export type GrupoIrmaos = {
  razaoSocial: string
  cidade: string
  /** O que está vinculado hoje, com a loja e o faturamento do mês. */
  vinculado: {
    merchantId: string
    merchantNome: string
    cliente: string
    loja: string
    unitId: string
    /* O faturamento do mês corrente da loja vinculada — é ELE que decide se
       vale conferir. R$ 94 num mês com irmão solto é o padrão da Varginha;
       R$ 16 mil é loja funcionando. */
    brutoDoMes: number
    pedidosDoMes: number
  } | null
  /** Os irmãos que ninguém vinculou. */
  soltos: { merchantId: string; nome: string }[]
}

export async function merchantsIrmaos(): Promise<GrupoIrmaos[]> {
  const admin = createAdminClient()
  const [{ data: merchants }, { data: vinculos }] = await Promise.all([
    admin
      .from("ifood_merchants")
      .select("id, name, corporate_name, city")
      // Ignorado é decisão tomada — não volta a levantar suspeita.
      .is("ignorado_em", null),
    admin
      .from("unit_platforms")
      .select(
        "api_store_id, unit_id, units!inner(name, brands!inner(holdings!inner(name)))",
      )
      .eq("platform", "ifood")
      .not("api_store_id", "is", null),
  ])

  const porMerchant = new Map<
    string,
    { unitId: string; loja: string; cliente: string }
  >()
  for (const v of (vinculos ?? []) as unknown as {
    api_store_id: string
    unit_id: string
    units: { name: string; brands: { holdings: { name: string } } }
  }[]) {
    porMerchant.set(v.api_store_id, {
      unitId: v.unit_id,
      loja: v.units.name,
      cliente: v.units.brands.holdings.name,
    })
  }

  const grupos = new Map<
    string,
    { razao: string; cidade: string; itens: { id: string; nome: string }[] }
  >()
  for (const m of (merchants ?? []) as {
    id: string
    name: string | null
    corporate_name: string | null
    city: string | null
  }[]) {
    if (!m.corporate_name) continue
    const razao = m.corporate_name.trim().toLowerCase()
    const cidade = (m.city ?? "").trim().toUpperCase()
    // Sem cidade não dá pra afirmar que são irmãos: a mesma empresa pode ter
    // loja em duas cidades, e aí são lojas diferentes de verdade.
    if (!cidade) continue
    const chave = `${razao}||${cidade}`
    const g = grupos.get(chave) ?? { razao, cidade, itens: [] }
    g.itens.push({ id: m.id, nome: m.name ?? "(sem nome)" })
    grupos.set(chave, g)
  }

  const out: GrupoIrmaos[] = []
  const agora = new Date()
  const ano = agora.getUTCFullYear()
  const mes = agora.getUTCMonth() + 1

  for (const g of grupos.values()) {
    if (g.itens.length < 2) continue
    const soltos = g.itens.filter((i) => !porMerchant.has(i.id))
    // Todos vinculados = duas lojas de verdade. Nenhum vinculado = pendência
    // de cadastro, que o outro aviso já cobre.
    if (soltos.length === 0 || soltos.length === g.itens.length) continue

    const vinc = g.itens.find((i) => porMerchant.has(i.id))!
    const info = porMerchant.get(vinc.id)!

    /* Uma consulta por grupo, e os grupos são poucos (quatro na base toda).
       Puxar o faturamento de todas as lojas pra depois filtrar seria o erro
       do `fetchAllRows` de novo. */
    const { data: fin } = await admin.rpc("ifood_financeiro_resumo_by_units", {
      p_unit_ids: [info.unitId],
      p_year: ano,
      p_month: mes,
    })
    const linha = ((fin ?? []) as { bruto: number | string; pedidos_unicos: number }[])[0]

    out.push({
      razaoSocial: g.razao,
      cidade: g.cidade,
      vinculado: {
        merchantId: vinc.id,
        merchantNome: vinc.nome,
        cliente: info.cliente,
        loja: info.loja,
        unitId: info.unitId,
        brutoDoMes: Number(linha?.bruto ?? 0),
        pedidosDoMes: linha?.pedidos_unicos ?? 0,
      },
      soltos: soltos.map((s) => ({ merchantId: s.id, nome: s.nome })),
    })
  }
  return out
}
