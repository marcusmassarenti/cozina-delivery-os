import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import { getRealMonthlyForUnitsForRange } from "./range-aggregation"
import { segundaDaSemana } from "./relatorio-semanal"

/**
 * A primeira tela da agência — T1 do painel.
 *
 * Responde "como está minha carteira hoje?" antes de qualquer detalhe. As
 * outras telas respondem sobre uma loja, um gestor, um vendedor; esta é a
 * única que olha o conjunto.
 */

export type Alerta = {
  unitId: string
  code: string
  nome: string
  logoUrl: string | null
  motivo: string
  /* O quanto, em reais — "caiu 26%" sozinho não diz se são R$ 300 ou
     R$ 80 mil, e é o valor que decide qual loja se atende primeiro. */
  de: number | null
  para: number | null
  /** Quanto pior, mais alto. Ordena a lista. */
  peso: number
}

export type GestorOpcao = { id: string; nome: string }

export type VisaoDaCarteira = {
  lojasAtivas: number
  lojasTotal: number
  faturamento: number
  /** Média por loja QUE TEM DADO — dividir pelo total afundaria a média com
   *  as lojas que nem importação têm. */
  mediaPorLoja: number
  lojasComDado: number
  /** Dias médios na carteira. É o número de churn da agência. */
  permanenciaMedia: number | null
  metasComValor: number
  metasBatidas: number
  semanaAtual: string
  semanasPendentes: number
  semanasVencendoHoje: number
  alertas: Alerta[]
  gestores: GestorOpcao[]
  /** Quantas lojas ativas ficaram de fora por causa do filtro. */
  foraDoFiltro: number
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

export async function visaoDaCarteira(
  periodo: { start: string; end: string },
  gestorId?: string | null,
): Promise<VisaoDaCarteira | null> {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return null
  const admin = createAdminClient()

  const [{ data: unitsRaw }, { data: gestoresRaw }] = await Promise.all([
    admin
      .from("units")
      .select(
        "id, code, name, active, logo_url, gestor_id, entrada_carteira, meta_30_dias, categoria_carteira, brands!inner(holding_id)",
      )
      .eq("brands.holding_id", holdingId),
    admin
      .from("gestores")
      .select("id, nome")
      .eq("holding_id", holdingId)
      .order("nome"),
  ])

  const gestores = (gestoresRaw ?? []) as GestorOpcao[]
  const todas = (unitsRaw ?? []) as unknown as {
    id: string
    code: string
    name: string
    active: boolean
    logo_url: string | null
    gestor_id: string | null
    entrada_carteira: string | null
    meta_30_dias: number | null
    categoria_carteira: string | null
  }[]
  /* O filtro corta ANTES de qualquer conta. Filtrar depois daria KPIs da
     rede inteira ao lado de uma lista de alertas de um gestor só — duas
     leituras na mesma tela, que é como se produz um painel em que ninguém
     confia. */
  const lojas =
    gestorId === "sem"
      ? todas.filter((l) => !l.gestor_id)
      : gestorId
        ? todas.filter((l) => l.gestor_id === gestorId)
        : todas
  const vazio: VisaoDaCarteira = {
    lojasAtivas: 0,
    lojasTotal: 0,
    faturamento: 0,
    mediaPorLoja: 0,
    lojasComDado: 0,
    permanenciaMedia: null,
    metasComValor: 0,
    metasBatidas: 0,
    semanaAtual: iso(segundaDaSemana(new Date())),
    semanasPendentes: 0,
    semanasVencendoHoje: 0,
    alertas: [],
    gestores,
    foraDoFiltro: todas.filter((l) => l.active).length - 0,
  }
  if (lojas.length === 0) return vazio

  const ids = lojas.map((l) => l.id)
  const ate = new Date()
  const trintaAtras = new Date()
  trintaAtras.setUTCDate(trintaAtras.getUTCDate() - 30)
  const sessentaAtras = new Date()
  sessentaAtras.setUTCDate(sessentaAtras.getUTCDate() - 60)
  const semana = segundaDaSemana(new Date())

  /* ⚠️ UMA FONTE SÓ PRA TODA A TELA.
   *
   * A primeira versão media "sem dado" por `daily_entries` e o faturamento
   * pelo agregador — e a tela saiu se contradizendo em público: o KPI dizia
   * "14 lojas com dado" e a lista embaixo acusava 12 delas de "sem nenhum
   * dado importado". `daily_entries` é a tabela de lançamento MANUAL; o
   * faturamento de verdade vem das importações e da API. Duas perguntas
   * parecidas respondidas por tabelas diferentes é como se produz um painel
   * que ninguém acredita. */
  const [periodoMap, ultimos30, anteriores30, { data: semanasFeitas }] =
    await Promise.all([
      getRealMonthlyForUnitsForRange(ids, periodo),
      getRealMonthlyForUnitsForRange(ids, {
        start: iso(trintaAtras),
        end: iso(ate),
      }),
      /* O bloco "precisa de atenção" compara 30 dias com os 30 ANTERIORES.
         Comparar com o mês passado do calendário faria toda loja parecer em
         queda no dia 3 do mês. */
      getRealMonthlyForUnitsForRange(ids, {
        start: iso(sessentaAtras),
        end: iso(trintaAtras),
      }),
      admin
        .from("relatorio_semanal")
        .select("unit_id")
        .in("unit_id", ids)
        .eq("semana_inicio", iso(semana))
        .not("entregue_em", "is", null),
    ])

  const vendeu = (m: { faturamentoBruto: number; pedidos: number } | undefined) =>
    !!m && (m.faturamentoBruto > 0 || m.pedidos > 0)

  const ativas = lojas.filter((l) => l.active)
  let faturamento = 0
  let comDado = 0
  const alertas: Alerta[] = []

  for (const l of ativas) {
    const m = periodoMap.get(l.id)
    const bruto = m?.faturamentoBruto ?? 0
    if (bruto > 0 || (m?.pedidos ?? 0) > 0) {
      faturamento += bruto
      comDado++
    }

    // ── loja caindo ──
    const a = ultimos30.get(l.id)?.faturamentoBruto ?? 0
    const b = anteriores30.get(l.id)?.faturamentoBruto ?? 0
    if (b > 0 && a > 0) {
      const queda = ((b - a) / b) * 100
      if (queda >= 15) {
        alertas.push({
          unitId: l.id,
          code: l.code,
          nome: l.name,
          logoUrl: l.logo_url,
          motivo: `caiu ${queda.toFixed(0)}%`,
          de: b,
          para: a,
          /* Peso pela QUEDA EM REAIS, não pelo percentual. Uma loja de
             R$ 3 mil que caiu 40% perde R$ 1,2 mil; uma de R$ 300 mil que
             caiu 16% perde R$ 48 mil. Ordenar por percentual põe a primeira
             no topo e a agência atende a errada. */
          peso: 1000 + (b - a),
        })
      }
    }

    /* ── parada ──
     * Granularidade de 30 dias, e não "sem dado há N dias": a data da última
     * venda pediria outra fonte, e foi justamente a segunda fonte que fez
     * esta tela mentir. Número grosso e certo vale mais que número fino e
     * errado.
     *
     * Loja "nova" fica de fora: ela ainda não vendeu porque não abriu, e
     * cobrar dela é cobrar o calendário do cliente. */
    if (l.categoria_carteira !== "nova" && !vendeu(ultimos30.get(l.id))) {
      const antes = anteriores30.get(l.id)
      alertas.push({
        unitId: l.id,
        code: l.code,
        nome: l.name,
        logoUrl: l.logo_url,
        motivo: antes && vendeu(antes)
          ? "parou de vender"
          : "sem venda há mais de 60 dias",
        de: antes?.faturamentoBruto ?? null,
        para: 0,
        // Parada vale mais que qualquer queda: perdeu 100%.
        peso: 1_000_000 + (antes?.faturamentoBruto ?? 0),
      })
    }
  }

  const comEntrada = lojas.filter((l) => l.entrada_carteira)
  const comMeta = ativas.filter((l) => (l.meta_30_dias ?? 0) > 0)

  const feitas = new Set(
    ((semanasFeitas ?? []) as { unit_id: string }[]).map((r) => r.unit_id),
  )
  /* A semana corrente ainda não venceu — o que conta como pendente é a loja
     ativa que ainda não teve comentário escrito nela. */
  const pendentes = ativas.filter((l) => !feitas.has(l.id)).length
  const diaDaSemana = new Date().getUTCDay() // 0=dom
  // O ciclo fecha na quarta (9 dias após a segunda da semana anterior).
  const vencendoHoje = diaDaSemana === 3 ? pendentes : 0

  return {
    lojasAtivas: ativas.length,
    lojasTotal: lojas.length,
    faturamento,
    mediaPorLoja: comDado > 0 ? faturamento / comDado : 0,
    lojasComDado: comDado,
    permanenciaMedia:
      comEntrada.length === 0
        ? null
        : Math.round(
            comEntrada.reduce(
              (s, l) =>
                s +
                (Date.now() -
                  new Date(`${l.entrada_carteira}T12:00:00Z`).getTime()) /
                  86400000,
              0,
            ) / comEntrada.length,
          ),
    metasComValor: comMeta.length,
    metasBatidas: comMeta.filter(
      (l) => (ultimos30.get(l.id)?.faturamentoBruto ?? 0) >= (l.meta_30_dias ?? 0),
    ).length,
    semanaAtual: iso(semana),
    semanasPendentes: pendentes,
    semanasVencendoHoje: vencendoHoje,
    alertas: alertas.sort((x, y) => y.peso - x.peso).slice(0, 12),
    gestores,
    foraDoFiltro: todas.filter((l) => l.active).length - ativas.length,
  }
}
