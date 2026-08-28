import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import { PLATAFORMAS } from "@/components/platform-logo"
import { getEvolucaoSeries } from "./comparativo"
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

export type PontoMes = {
  rotulo: string
  faturamento: number
  pedidos: number
  /**
   * O mês corrente ainda não acabou.
   *
   * ⚠️ Sem isto a última barra parece um mês fechado menor que os outros, e a
   * leitura natural é "caiu". Já aconteceu aqui: o Nino anunciou queda de
   * 16,7% numa rede que cresceu 1% comparando um mês cheio com um pela
   * metade. A régua que funcionou foi marcar PARCIAL junto do valor, não uma
   * nota de rodapé.
   */
  parcial: boolean
}

export type LojaNoTopo = {
  code: string
  nome: string
  logoUrl: string | null
  valor: number
  fatia: number
}

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

  /* ── O dinheiro da AGÊNCIA ──────────────────────────────────────────── */
  mrr: number
  lojasSemMensalidade: number
  recebido: number
  aReceber: number
  atrasado: number
  despesasPagas: number
  sobra: number

  /* ── A carteira, comparada com o período anterior ───────────────────── */
  pedidos: number
  ticket: number
  faturamentoAnterior: number
  pedidosAnterior: number

  /* ── Movimento ──────────────────────────────────────────────────────── */
  emOnboarding: number
  lojasNovas30: number
  lojasParadas: number

  /* ── Risco e evolução ───────────────────────────────────────────────── */
  serie: PontoMes[]
  topLojas: LojaNoTopo[]
  concentracaoTop5: number
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
        "id, code, name, active, logo_url, gestor_id, entrada_carteira, meta_30_dias, categoria_carteira, mensalidade, etapa_id, data_inauguracao, brands!inner(holding_id)",
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
    mensalidade: number | string | null
    etapa_id: string | null
    data_inauguracao: string | null
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
    foraDoFiltro: 0,
    mrr: 0,
    lojasSemMensalidade: 0,
    recebido: 0,
    aReceber: 0,
    atrasado: 0,
    despesasPagas: 0,
    sobra: 0,
    pedidos: 0,
    ticket: 0,
    faturamentoAnterior: 0,
    pedidosAnterior: 0,
    emOnboarding: 0,
    lojasNovas30: 0,
    lojasParadas: 0,
    serie: [],
    topLojas: [],
    concentracaoTop5: 0,
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
  /* Período anterior do MESMO tamanho, colado no início do atual.
     Comparar com "o mês passado do calendário" faria toda loja parecer em
     queda no dia 3 do mês. */
  const dias =
    Math.round(
      (new Date(periodo.end).getTime() - new Date(periodo.start).getTime()) /
        86400000,
    ) + 1
  const antesFim = new Date(`${periodo.start}T12:00:00Z`)
  antesFim.setUTCDate(antesFim.getUTCDate() - 1)
  const antesIni = new Date(antesFim)
  antesIni.setUTCDate(antesIni.getUTCDate() - (dias - 1))

  /* Seis meses de série, não doze: cada mês é uma agregação completa, e a
     tela já é a mais cara da seção. Seis mostram a tendência e cabem numa
     olhada; doze dobrariam o custo pra responder a mesma pergunta. */
  const hojeD = new Date()
  const mesesSerie = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(
      Date.UTC(hojeD.getUTCFullYear(), hojeD.getUTCMonth() - (5 - i), 1),
    )
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, d }
  })

  const [
    periodoMap,
    ultimos30,
    anteriores30,
    { data: semanasFeitas },
    periodoAnterior,
    serieRaw,
    { data: cobRaw },
    { data: despRaw },
  ] = await Promise.all([
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
      getRealMonthlyForUnitsForRange(ids, {
        start: iso(antesIni),
        end: iso(antesFim),
      }),
      getEvolucaoSeries(ids, PLATAFORMAS, mesesSerie),
      /* O dinheiro da agência vem das cobranças LANÇADAS, não da mensalidade
         do cadastro — a mensalidade projeta, a cobrança registra. Mesma
         lição do repasse do iFood: número reconstruído bate quase sempre e
         mente nos meses que importam. */
      admin
        .from("agencia_cobrancas")
        .select("valor, vencimento, pago_em")
        .eq("holding_id", holdingId)
        .gte("vencimento", periodo.start)
        .lte("vencimento", periodo.end),
      admin
        .from("agencia_despesas")
        .select("valor, pago_em")
        .eq("holding_id", holdingId)
        .gte("vencimento", periodo.start)
        .lte("vencimento", periodo.end),
    ])

  const vendeu = (m: { faturamentoBruto: number; pedidos: number } | undefined) =>
    !!m && (m.faturamentoBruto > 0 || m.pedidos > 0)

  const ativas = lojas.filter((l) => l.active)
  let faturamento = 0
  let pedidos = 0
  let comDado = 0
  const alertas: Alerta[] = []
  const porLoja: LojaNoTopo[] = []

  for (const l of ativas) {
    const m = periodoMap.get(l.id)
    const bruto = m?.faturamentoBruto ?? 0
    if (bruto > 0 || (m?.pedidos ?? 0) > 0) {
      faturamento += bruto
      pedidos += m?.pedidos ?? 0
      comDado++
      porLoja.push({
        code: l.code,
        nome: l.name,
        logoUrl: l.logo_url,
        valor: bruto,
        fatia: 0,
      })
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

  const ordenadasPorValor = [...porLoja].sort((a, b) => b.valor - a.valor)
  const top = ordenadasPorValor.slice(0, 5).map((l) => ({
    ...l,
    fatia: faturamento > 0 ? (l.valor / faturamento) * 100 : 0,
  }))

  const cobrancas = (cobRaw ?? []) as {
    valor: number | string
    vencimento: string
    pago_em: string | null
  }[]
  const somaCob = (f: (c: (typeof cobrancas)[number]) => boolean) =>
    cobrancas.filter(f).reduce((s2, c) => s2 + Number(c.valor), 0)
  const pagas = ((despRaw ?? []) as { valor: number | string; pago_em: string | null }[])
    .filter((d) => d.pago_em !== null)
    .reduce((s2, d) => s2 + Number(d.valor), 0)
  const hojeISO = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  })

  const somaMapa = (
    m: Map<string, { faturamentoBruto: number; pedidos: number }>,
    campo: "faturamentoBruto" | "pedidos",
  ) => [...m.values()].reduce((s2, v) => s2 + v[campo], 0)

  const comMensalidade = ativas.filter((l) => l.mensalidade !== null)
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

    /* ── AGÊNCIA ─────────────────────────────────────────────────────── */
    mrr: comMensalidade.reduce((s2, l) => s2 + Number(l.mensalidade), 0),
    lojasSemMensalidade: ativas.length - comMensalidade.length,
    recebido: somaCob((c) => c.pago_em !== null),
    aReceber: somaCob((c) => c.pago_em === null && c.vencimento >= hojeISO),
    atrasado: somaCob((c) => c.pago_em === null && c.vencimento < hojeISO),
    despesasPagas: pagas,
    // Sobra usa só dinheiro que se MOVEU. Com o previsto, seria uma sobra
    // que existe na planilha e não na conta.
    sobra: somaCob((c) => c.pago_em !== null) - pagas,

    /* ── CARTEIRA ────────────────────────────────────────────────────── */
    pedidos,
    ticket: pedidos > 0 ? faturamento / pedidos : 0,
    faturamentoAnterior: somaMapa(periodoAnterior, "faturamentoBruto"),
    pedidosAnterior: somaMapa(periodoAnterior, "pedidos"),

    /* ── MOVIMENTO ───────────────────────────────────────────────────── */
    emOnboarding: lojas.filter(
      (l) => l.etapa_id !== null || l.categoria_carteira === "nova",
    ).length,
    lojasNovas30: lojas.filter(
      (l) => l.entrada_carteira && l.entrada_carteira >= iso(trintaAtras),
    ).length,
    lojasParadas: alertas.filter((a) => a.para === 0).length,

    /* ── RISCO E EVOLUÇÃO ────────────────────────────────────────────── */
    serie: serieRaw.map((p) => ({
      rotulo: new Date(Date.UTC(p.year, p.month - 1, 1)).toLocaleDateString(
        "pt-BR",
        { month: "short", timeZone: "UTC" },
      ),
      faturamento: p.metrics.bruto,
      pedidos: p.metrics.pedidos,
      parcial:
        p.year === hojeD.getUTCFullYear() && p.month === hojeD.getUTCMonth() + 1,
    })),
    topLojas: top,
    /* CONCENTRAÇÃO: quanto do faturamento depende das 5 maiores. É a
       pergunta de risco que ninguém faz até a maior sair da carteira. */
    concentracaoTop5:
      faturamento > 0
        ? (top.reduce((s2, l) => s2 + l.valor, 0) / faturamento) * 100
        : 0,
  }
}
