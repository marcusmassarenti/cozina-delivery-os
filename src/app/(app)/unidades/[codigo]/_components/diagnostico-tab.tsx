import {
  Activity,
  AlertTriangle,
  Award,
  CheckCircle2,
  ChevronDown,
  Handshake,
  Info,
  Megaphone,
  MousePointerClick,
  Receipt,
  ShoppingBag,
  Sliders,
  Star,
  Stethoscope,
  Store,
  TrendingUp,
  Wallet,
} from "lucide-react"

import {
  getCardapioPeriodoForMonth,
  getFinanceiroResumoForMonth,
  getFunnelForMonth,
  getNegociacoesForMonth,
  getOperacaoForMonth,
  getPromocoesForMonth,
  getSuperForMonth,
} from "@/lib/data/ifood-imported"
import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { getEnabledReports } from "@/lib/data/report-prefs"
import { getOperacaoConsolidada } from "@/lib/data/operacao-consolidada"
import { getEvolucaoSeries } from "@/lib/data/comparativo"
import { getDiagnosticoIA, getIaStatus } from "@/lib/data/diagnostico-ia"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import type { UnitMonthly } from "@/lib/mock-monthly"

import { DiagPdfButton } from "./diag-pdf-button"
import { FunnelCard } from "./funnel-card"
import { DiagIA } from "./diag-ia"
import { DiagEvolucao, type EvoSerie } from "./diag-evolucao"
import { DiagShareChart } from "./diag-share-chart"

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

// Metas de mercado (mesmas referências do diagnóstico da Premier / iFood).
const META = {
  cancelamentoMax: 1, // %
  chamadosMax: 2.5, // % (negociações/chamados)
  tempoOnlineMin: 97, // %
  marketingMax: 20, // % do faturamento
  cmvMax: 40, // %
  conversaoMin: 12, // %
  notaMin: 4.5,
}

/** Funil unificado: prefere o snapshot do período; cai pro diário. */
type Funil = {
  fonte: "periodo" | "diario"
  periodLabel: string
  visitas: number
  visualizacoes: number
  sacola: number
  revisao: number
  concluidos: number
  conversaoPct: number
  conversaoPctAnterior: number | null
}

export async function DiagnosticoTab({
  unitId,
  unitName,
  unitCode,
  monthly,
  year,
  month,
}: {
  unitId: string
  unitName: string
  unitCode: string
  monthly: UnitMonthly
  year: number
  month: number
}) {
  const [funnel, periodo, operacao, promocoes, superAval, negociacoes, ifood] =
    await Promise.all([
      getFunnelForMonth(unitId, year, month),
      getCardapioPeriodoForMonth(unitId, year, month),
      getOperacaoForMonth(unitId, year, month),
      getPromocoesForMonth(unitId, year, month),
      getSuperForMonth(unitId, year, month),
      getNegociacoesForMonth(unitId, year, month),
      getFinanceiroResumoForMonth(unitId, year, month),
    ])
  const enabled = await getEnabledReports()
  // Últimos 6 meses pra o gráfico de evolução (todas as plataformas somadas).
  const periodos6 = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(year, month - 1 - (5 - i), 1)
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  })
  const [planoIA, iaStatus, consol, evoIf, evo99, evoKe] = await Promise.all([
    getDiagnosticoIA(unitId, year, month),
    getIaStatus(),
    getOperacaoConsolidada(unitId, year, month),
    getEvolucaoSeries([unitId], ["ifood"], periodos6),
    getEvolucaoSeries([unitId], ["99food"], periodos6),
    getEvolucaoSeries([unitId], ["keeta"], periodos6),
  ])
  // Uma série por plataforma (mesmas cores da consolidada).
  const evoLabels = periodos6.map(
    (p) => `${String(p.month).padStart(2, "0")}/${String(p.year).slice(2)}`,
  )
  const EVO_COR: Record<PlatformId, string> = {
    ifood: "#EF4444",
    keeta: "#16A34A",
    "99food": "#EAB308",
    cardapioweb: "#5B2A86",
  }
  const EVO_LABEL: Record<PlatformId, string> = {
    ifood: "iFood",
    keeta: "Keeta",
    "99food": "99 Food",
    cardapioweb: "Cardápio Web",
  }
  const rawEvo: { id: PlatformId; raw: typeof evoIf }[] = [
    { id: "ifood", raw: evoIf },
    { id: "keeta", raw: evoKe },
    { id: "99food", raw: evo99 },
  ]
  const evoSeries: EvoSerie[] = rawEvo
    .map(({ id, raw }) => ({
      id,
      label: EVO_LABEL[id],
      color: EVO_COR[id],
      pontos: raw.map((p) => ({
        bruto: p.metrics.bruto,
        pedidos: p.metrics.pedidos,
        ticket: p.metrics.ticket,
        hasData: p.metrics.hasData,
      })),
    }))
    .filter((s) => s.pontos.some((p) => p.hasData))
  const temEvolucao = evoSeries.some(
    (s) => s.pontos.filter((p) => p.hasData).length >= 2,
  )
  // Só monta o comparativo por plataforma com quem realmente tem dado.
  const platsComDados = consol.plataformas.filter((p) => p.temDados)
  const multiPlataforma = platsComDados.length > 1

  const mesLabel = `${MESES[month - 1]} de ${year}`
  const hojeStr = new Date().toLocaleDateString("pt-BR")

  const funil: Funil | null = periodo
    ? {
        fonte: "periodo",
        periodLabel: periodo.periodLabel,
        visitas: periodo.visitas,
        visualizacoes: periodo.visualizacoes,
        sacola: periodo.sacola,
        revisao: periodo.revisao,
        concluidos: periodo.concluidos,
        conversaoPct: periodo.conversaoPct,
        conversaoPctAnterior: periodo.conversaoPctAnterior,
      }
    : funnel.diasComDado > 0
      ? {
          fonte: "diario",
          periodLabel: `${funnel.diasComDado} dia${funnel.diasComDado > 1 ? "s" : ""} com dado`,
          visitas: funnel.visitas,
          visualizacoes: funnel.visualizacoes,
          sacola: funnel.sacola,
          revisao: funnel.revisao,
          concluidos: funnel.concluidos,
          conversaoPct: funnel.conversaoPct,
          conversaoPctAnterior: null,
        }
      : null

  // ── Números principais (SÓ iFood) ─────────────────────────────────
  // O painel é do iFood: usa faturamento/pedidos da Conciliação do iFood, não
  // o consolidado (iFood + 99 + Keeta), pra tudo falar a mesma língua do funil.
  const temIfood = ifood.hasData
  const faturamento = temIfood ? ifood.bruto : monthly.faturamentoBruto
  const cancelQtdIfood = ifood.cancelamentoTotalQtd + ifood.cancelamentoParcialQtd
  const pedidos = temIfood ? ifood.pedidosUnicos : monthly.pedidos
  const conversao = funil?.conversaoPct ?? null
  // CMV é custo da loja inteira (não separa por canal) — % sobre o faturamento
  // TOTAL da loja, não só o iFood. Mantemos o denominador consolidado.
  const faturamentoTotal = monthly.faturamentoBruto

  // ── Saúde da operação ─────────────────────────────────────────────
  const totalPedidos = pedidos + cancelQtdIfood
  // Prefere o % de cancelamento do iFood (Qualidade da operação) quando existe;
  // senão, deriva dos cancelamentos do iFood na Conciliação.
  // Preferência: cancelamento OFICIAL do iFood (Qualidade → Super). Só cai pra
  // derivação da Conciliação se nenhum dos dois existir — essa derivação conta
  // as linhas de cancelamento financeiro e superestima a métrica oficial.
  const cancelamentoPct =
    operacao?.pctCancelamento ??
    superAval?.pctCancelamento ??
    (totalPedidos > 0 ? (cancelQtdIfood / totalPedidos) * 100 : null)
  const tempoOnline = operacao?.pctTempoOnline ?? null
  // Prefere o % de chamados do Super (taxa real de chamados válidos); cai pro
  // "% negociações super" do Qualidade.
  const chamadosPct = superAval?.pctChamados ?? operacao?.pctNegociacoes ?? null
  const nivelSuper = superAval?.status ?? operacao?.nivelSuper ?? null
  // Prefere o investimento da loja no relatório de Promoções (mais fiel);
  // senão, promoções + anúncios do iFood na Conciliação.
  // Na Conciliação, promoção/anúncios vêm como dedução (valor NEGATIVO). Como é
  // investimento (custo positivo), usa o valor absoluto no fallback.
  const investimentoMkt =
    promocoes?.investimentoLojas ??
    Math.abs(ifood.promocaoLoja) + Math.abs(ifood.pacoteAnuncios)
  // Marketing % = gasto ÷ faturamento. Quando o investimento vem do relatório
  // de Promoções, a janela dele (~30d) pode não bater com a do faturamento do
  // mês (parcial no mês corrente). Normalizamos os DOIS por dia pra não inflar.
  const dias = (a: string, b: string) =>
    Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1
  const hoje = new Date()
  const mesCorrente =
    hoje.getFullYear() === year && hoje.getMonth() + 1 === month
  const diasFat = mesCorrente ? hoje.getDate() : new Date(year, month, 0).getDate()
  const diasPromo = promocoes ? dias(promocoes.periodStart, promocoes.periodEnd) : null
  const marketingPct =
    faturamento <= 0 || diasFat <= 0
      ? null
      : diasPromo && promocoes
        ? ((investimentoMkt / diasPromo) / (faturamento / diasFat)) * 100
        : (investimentoMkt / faturamento) * 100
  const cmvValor =
    monthly.custoProdutosCozina + (monthly.custoProdutosLoja ?? 0)
  // CMV é lançado manualmente. Quando não foi preenchido (cmvValor = 0), o card
  // não deve aparecer verde "0%" (falso "custo ótimo") — fica null e some.
  const cmvPct =
    faturamentoTotal > 0 && cmvValor > 0
      ? (cmvValor / faturamentoTotal) * 100
      : null
  // Nota do iFood (Super) tem prioridade; senão a nota consolidada.
  const nota =
    superAval?.mediaAvaliacoes ?? (monthly.notaMedia > 0 ? monthly.notaMedia : null)

  // ── Cenários de crescimento ───────────────────────────────────────
  // Melhorar a conversão em X% (mantendo visitas e ticket) faz o faturamento
  // subir os mesmos X%. Ancoramos no faturamento REAL do mês pra a projeção
  // ficar na mesma unidade (evita misturar a janela do funil com a do
  // financeiro, que dava número estourado). A conversão-alvo é só o "como".
  const cenarios =
    faturamento > 0 && conversao != null && conversao > 0
      ? [
          { label: "Pessimista", mult: 1.1, delta: "+10%" },
          { label: "Realista", mult: 1.2, delta: "+20%" },
          { label: "Otimista", mult: 1.3, delta: "+30%" },
        ].map((c) => ({
          ...c,
          conv: conversao * c.mult,
          receita: faturamento * c.mult,
        }))
      : null

  // ── Pontos de atenção automáticos ─────────────────────────────────
  const atencao: { texto: string; grave: boolean }[] = []
  if (conversao != null && conversao < META.conversaoMin)
    atencao.push({
      texto: `Taxa de conversão baixa (${fmtPct(conversao)}, ideal acima de ${META.conversaoMin}%). A loja aparece mas pouca gente conclui — foco em cardápio e fotos.`,
      grave: true,
    })
  if (cancelamentoPct != null && cancelamentoPct > META.cancelamentoMax)
    atencao.push({
      texto: `Cancelamentos acima do ideal (${fmtPct(cancelamentoPct)}, meta ${META.cancelamentoMax}%). Derruba ranqueamento e recompra.`,
      grave: true,
    })
  if (tempoOnline != null && tempoOnline < META.tempoOnlineMin)
    atencao.push({
      texto: `Tempo online abaixo do ideal (${fmtPct(tempoOnline)}, meta ≥ ${META.tempoOnlineMin}%). Cada hora fechada é venda perdida e cai no ranqueamento.`,
      grave: tempoOnline < 90,
    })
  if (chamadosPct != null && chamadosPct > META.chamadosMax)
    atencao.push({
      texto: `Chamados acima do ideal (${fmtPct(chamadosPct)}, meta ≤ ${META.chamadosMax}%). ${operacao?.topMotivosChamados ? `Principais: ${operacao.topMotivosChamados}.` : "Revisar conferência e comunicação com o cliente."}`,
      grave: false,
    })
  if (marketingPct != null && marketingPct > META.marketingMax)
    atencao.push({
      texto: `Investimento em marketing alto (${fmtPct(marketingPct)} do faturamento, ideal até ${META.marketingMax}%). Revisar campanhas de baixo retorno.`,
      grave: false,
    })
  if (cmvPct != null && cmvPct > META.cmvMax)
    atencao.push({
      texto: `CMV acima de ${META.cmvMax}% (${fmtPct(cmvPct)}). Revisar ficha técnica e preço de venda.`,
      grave: true,
    })
  if (nota != null && nota < META.notaMin)
    atencao.push({
      texto: `Nota média abaixo de ${META.notaMin.toFixed(1)} (${nota.toFixed(2)}). Atacar os principais motivos de reclamação.`,
      grave: false,
    })

  // Sentimento das avaliações (tags do Super) — top elogios e reclamações.
  const topTags = (m: Record<string, number>, n = 4) =>
    Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
  const elogios = superAval ? topTags(superAval.tagsPos) : []
  const reclamacoes = superAval ? topTags(superAval.tagsNeg) : []
  const motivosNeg = negociacoes ? topTags(negociacoes.topMotivos, 5) : []
  // Foco prioritário: o problema mais impactante (grave primeiro). Sem
  // problemas, aponta a maior alavanca de crescimento (a conversão).
  const foco =
    atencao.find((a) => a.grave)?.texto ??
    atencao[0]?.texto ??
    (conversao != null
      ? `Loja saudável nos indicadores. A maior alavanca agora é a conversão (${fmtPct(conversao)}): melhore cardápio, fotos e descrições pra transformar mais visitas em pedidos.`
      : null)
  const planoIfood =
    superAval?.planoDeAcao &&
    !/^manter os indicadores/i.test(superAval.planoDeAcao)
      ? superAval.planoDeAcao
      : null

  const semDadosNenhum = faturamento === 0 && pedidos === 0 && !funil

  // ── Score de saúde (0-100) — desconta por problema detectado ──────────
  const graves = atencao.filter((a) => a.grave).length
  const leves = atencao.length - graves
  const saudeScore = Math.max(20, Math.min(100, 100 - graves * 16 - leves * 8))
  const saudeTone: "bom" | "atencao" | "critico" =
    saudeScore >= 80 ? "bom" : saudeScore >= 55 ? "atencao" : "critico"
  const veredito =
    saudeTone === "bom"
      ? "Operação saudável"
      : saudeTone === "atencao"
        ? "Operação com pontos de atenção"
        : "Operação precisa de ação"

  return (
    <div id="diag-report" data-print="page" className="flex flex-col gap-5">
      {/* Capa (só no PDF) */}
      <div className="diag-cover hidden" aria-hidden>
        <div className="dc-brand">
          <PlatformLogo platform="ifood" className="dc-logo" />
          COZINA · DELIVERY OS
        </div>
        <div className="dc-kicker">Relatório · Diagnóstico de loja</div>
        <h1 className="dc-title">Plano de ação</h1>
        <div className="dc-store">
          {unitName} <span className="dc-code">#{unitCode}</span>
        </div>
        <div className="dc-meta">
          {platsComDados.map((p) => p.label).join(" · ") || "iFood"} · {mesLabel}
          {nivelSuper ? ` · Super Restaurante · ${nivelSuper.replace(/nivel/i, "Nível")}` : ""}
        </div>
        <div className="dc-date">
          Gerado em {hojeStr} · Operação{" "}
          {multiPlataforma ? "consolidada (todas as plataformas)" : "do iFood"}
        </div>
      </div>

      {/* Rodapé de marca (repete em cada página do PDF) */}
      <div className="diag-foot hidden" aria-hidden>
        Delivery OS · Diagnóstico · {unitName} #{unitCode} · {mesLabel}
      </div>

      {/* Cabeçalho */}
      <div className="diag-screen-head flex flex-wrap items-center gap-2">
        <Stethoscope className="size-5 text-primary" />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">
            Diagnóstico da operação
          </h2>
          <p className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
            {platsComDados.length > 0 ? (
              platsComDados.map((p) => (
                <PlatformLogo
                  key={p.id}
                  platform={p.id}
                  className="size-3 rounded-[3px]"
                />
              ))
            ) : (
              <PlatformLogo platform="ifood" className="size-3 rounded-[3px]" />
            )}
            <span className="ml-0.5">
              {mesLabel} ·{" "}
              {multiPlataforma
                ? `${platsComDados.length} plataformas`
                : (platsComDados[0]?.label ?? "iFood")}
            </span>
          </p>
        </div>
        {nivelSuper && <SuperBadge status={nivelSuper} />}
        <div className="ml-auto">
          <DiagPdfButton />
        </div>
      </div>

      {semDadosNenhum && (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">Sem dados pra diagnosticar ainda</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Importe os relatórios de Financeiro e Cardápio desta loja em{" "}
            <a href="/importacao" className="underline">
              /importacao
            </a>{" "}
            pra montar o diagnóstico.
          </p>
        </div>
      )}

      {!semDadosNenhum && (
        <>
          {/* ── Veredito (decisão no topo) ── */}
          <div className="diag-in">
            <Veredito
              score={saudeScore}
              tone={saudeTone}
              titulo={veredito}
              foco={foco}
            />
          </div>

          {/* ── Plano de ação por IA ── */}
          {/* key por período: ao trocar o mês, remonta com o plano certo
              (senão o useState guarda o plano do mês anterior). */}
          <div
            className="diag-in"
            style={{ animationDelay: "0.06s" } as React.CSSProperties}
          >
            <DiagIA
              key={`${unitId}-${year}-${month}`}
              unitId={unitId}
              unitName={unitName}
              year={year}
              month={month}
              inicial={planoIA}
              podeUsar={iaStatus.podeUsar}
              motivo={iaStatus.motivo}
            />
          </div>

          {/* ── Operação consolidada (todas as plataformas) ── */}
          {platsComDados.length > 0 && (
            <section
              className="diag-in rounded-xl border border-l-4 border-l-primary bg-card p-5 shadow-sm"
              style={{ animationDelay: "0.12s" } as React.CSSProperties}
            >
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Store className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">Operação consolidada</h3>
                <div className="flex items-center gap-1">
                  {platsComDados.map((p) => (
                    <PlatformLogo
                      key={p.id}
                      platform={p.id}
                      className="size-3.5 rounded-[3px]"
                    />
                  ))}
                </div>
              </div>
              <p className="mb-4 text-xs text-muted-foreground">
                {multiPlataforma
                  ? "Suas plataformas somadas neste mês. Clique numa pra ver só ela."
                  : "Sua operação neste mês. Ligue 99 Food e Keeta pra ver o total consolidado."}
              </p>
              {multiPlataforma ? (
                <DiagShareChart
                  plats={platsComDados
                    .slice()
                    .sort((a, b) => b.bruto - a.bruto)
                    .map((p) => ({
                      id: p.id,
                      label: p.label,
                      bruto: p.bruto,
                      pedidos: p.pedidos,
                      ticket: p.ticket,
                      sharePct: p.sharePct,
                    }))}
                  total={consol.total}
                />
              ) : (
                <div className="diag-kpis grid gap-3 sm:grid-cols-3">
                  <Kpi
                    icon={Wallet}
                    label="Faturamento total"
                    value={fmtBRL(consol.total.bruto)}
                    hint="receita bruta"
                    highlight
                  />
                  <Kpi
                    icon={Receipt}
                    label="Pedidos totais"
                    value={fmtNum(consol.total.pedidos)}
                    hint="no mês"
                  />
                  <Kpi
                    icon={TrendingUp}
                    label="Ticket médio"
                    value={fmtBRL(consol.total.ticket)}
                    hint="da operação"
                  />
                </div>
              )}
            </section>
          )}

          {/* ── Evolução mensal (linha por plataforma) ── */}
          {temEvolucao && (
            <div
              className="diag-in"
              style={{ animationDelay: "0.16s" } as React.CSSProperties}
            >
              <DiagEvolucao labels={evoLabels} series={evoSeries} />
            </div>
          )}

          {/* ── Funil de conversão ── */}
          {funil && (
            <section
              className="diag-in rounded-xl border border-l-4 border-l-indigo-500 bg-card p-5 shadow-sm"
              style={{ animationDelay: "0.2s" } as React.CSSProperties}
            >
              <div className="mb-3 flex items-center gap-2">
                <MousePointerClick className="size-4 text-indigo-600" />
                <h3 className="text-sm font-semibold">
                  Funil de conversão · {funil.periodLabel}
                </h3>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Onde você perde gente no caminho até o pedido. A maior queda
                entre as etapas é onde vale focar.
              </p>
              <div className="diag-funnel grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                <FunnelCard
                  label="Visitas"
                  value={funil.visitas}
                  base={funil.visitas}
                  legenda="Visitaram o cardápio"
                />
                <FunnelCard
                  label="Visualizações"
                  value={funil.visualizacoes}
                  base={funil.visitas}
                  legenda="Viram algum item"
                />
                <FunnelCard
                  label="Sacola"
                  value={funil.sacola}
                  base={funil.visitas}
                  legenda="Adicionaram à sacola"
                />
                <FunnelCard
                  label="Revisão"
                  value={funil.revisao}
                  base={funil.visitas}
                  legenda="Revisaram o pedido"
                />
                <FunnelCard
                  label="Concluídos"
                  value={funil.concluidos}
                  base={funil.visitas}
                  legenda="Concluíram o pedido"
                  positive
                />
              </div>
              <div className="mt-3 flex items-center justify-between rounded-md bg-indigo-50 px-3 py-2 dark:bg-indigo-950/30">
                <span className="text-xs font-medium text-indigo-900 dark:text-indigo-300">
                  Conversão do período
                </span>
                <div className="flex items-center gap-3 tabular-nums">
                  <span className="text-lg font-bold text-indigo-700 dark:text-indigo-400">
                    {fmtPct(funil.conversaoPct)}
                  </span>
                  {funil.conversaoPctAnterior != null && (
                    <span className="text-[10px] text-muted-foreground">
                      ant. {fmtPct(funil.conversaoPctAnterior)}
                    </span>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* ── Saúde da operação ── */}
          <section
            className="diag-in rounded-xl border bg-card p-5 shadow-sm"
            style={{ animationDelay: "0.24s" } as React.CSSProperties}
          >
            <h3 className="text-sm font-semibold">Saúde da operação</h3>
            <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
              Os indicadores que o iFood usa pra te ranquear. Fora da meta =
              menos visibilidade na busca e menos recompra.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-flow-col lg:auto-cols-fr lg:[grid-template-columns:none]">
              <Health
                label="Cancelamentos"
                value={cancelamentoPct}
                meta={META.cancelamentoMax}
                lowerIsBetter
                fmt={fmtPct}
                explicacao="Quanto dos seus pedidos foram cancelados. Cancelamento alto derruba seu ranqueamento no iFood e faz o cliente não voltar. Quanto menor, melhor."
              />
              {tempoOnline != null && (
                <Health
                  label="Tempo online"
                  value={tempoOnline}
                  meta={META.tempoOnlineMin}
                  lowerIsBetter={false}
                  fmt={fmtPct}
                  explicacao="Quanto do horário que você deveria estar aberto a loja ficou de fato online. Cada hora fechada é venda perdida e faz a loja cair na busca."
                />
              )}
              {chamadosPct != null && (
                <Health
                  label="Chamados"
                  value={chamadosPct}
                  meta={META.chamadosMax}
                  lowerIsBetter
                  fmt={fmtPct}
                  explicacao="Quantos pedidos viraram chamado do cliente (item errado, faltando, atraso). É um pedido de socorro — quanto menos, melhor a operação."
                />
              )}
              <Health
                label="Marketing / faturamento"
                value={marketingPct}
                meta={META.marketingMax}
                lowerIsBetter
                fmt={fmtPct}
                explicacao="Quanto você gasta em promoções e anúncios sobre o faturamento. Acima de 20% começa a comer a margem — corte as campanhas de baixo retorno."
              />
              {cmvPct != null && (
                <Health
                  label="CMV"
                  value={cmvPct}
                  meta={META.cmvMax}
                  lowerIsBetter
                  fmt={fmtPct}
                  explicacao="Custo da mercadoria vendida (ingredientes + embalagem) sobre o faturamento. Acima de 40% aperta o lucro — revise ficha técnica e preço de venda."
                />
              )}
              <Health
                label="Nota média"
                value={nota}
                meta={META.notaMin}
                lowerIsBetter={false}
                fmt={(n) => n.toFixed(2)}
                explicacao="A média das avaliações dos clientes. Abaixo de 4,5 pesa no ranqueamento e afasta pedidos novos. Ataque os motivos mais reclamados."
              />
            </div>

            {/* Tempos de operação (informativo, do iFood) */}
            {operacao && (
              <div className="mt-3 flex flex-wrap gap-2 border-t pt-3 text-[11px] text-muted-foreground">
                {operacao.tempoMedioPreparoMin != null && (
                  <InfoChip
                    label="Preparo médio"
                    value={`${operacao.tempoMedioPreparoMin.toFixed(1)} min`}
                  />
                )}
                {operacao.pctAtrasados != null && (
                  <InfoChip
                    label="Pedidos atrasados 5min+"
                    value={fmtPct(operacao.pctAtrasados)}
                  />
                )}
                {operacao.tempoMedioAtrasoMin != null &&
                  operacao.tempoMedioAtrasoMin > 0 && (
                    <InfoChip
                      label="Atraso médio"
                      value={`${operacao.tempoMedioAtrasoMin.toFixed(1)} min`}
                    />
                  )}
                {operacao.pctRespostasNegociacoes != null && (
                  <InfoChip
                    label="Respostas nas negociações"
                    value={fmtPct(operacao.pctRespostasNegociacoes)}
                  />
                )}
              </div>
            )}
          </section>

          {/* ── Ver detalhes (colapsável — some do print, abre tudo) ── */}
          <details
            className="diag-details diag-in group rounded-xl border bg-card shadow-sm [&_summary::-webkit-details-marker]:hidden"
            style={{ animationDelay: "0.28s" } as React.CSSProperties}
          >
            <summary className="diag-print-hide flex cursor-pointer list-none items-center gap-2 p-4">
              <Sliders className="size-4 text-muted-foreground" />
              <span className="text-sm font-semibold">
                Mais detalhes da operação
              </span>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                cenários, marketing, sentimento, negociações…
              </span>
              <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="flex flex-col gap-5 border-t p-4">
              {/* ── Cenários de crescimento ── */}
              {cenarios && (
                <section className="rounded-xl border bg-card p-5 shadow-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-sm font-semibold">
                      Cenários de crescimento
                    </h3>
                    <PlatformLogo
                      platform="ifood"
                      className="size-3.5 rounded-[3px]"
                    />
                    <span className="text-[11px] text-muted-foreground">
                      só iFood
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Projeção sobre o faturamento do <b>iFood</b> (onde existe o
                    funil), melhorando só a conversão — mesmas visitas e mesmo
                    ticket. Cada +1% de conversão vira faturamento direto.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    {cenarios.map((c) => (
                      <div
                        key={c.label}
                        className="rounded-lg border bg-muted/30 p-4"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {c.label}
                          </span>
                          <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                            {c.delta}
                          </span>
                        </div>
                        <p className="mt-2 text-xl font-bold tabular-nums">
                          {fmtBRL(c.receita)}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          conversão {fmtPct(conversao as number)} →{" "}
                          {fmtPct(c.conv)}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

          {/* ── Marketing e promoções (ROI) ── */}
          {promocoes && promocoes.investimentoLojas > 0 && (
            <section className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Megaphone className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">
                  Marketing e promoções
                </h3>
                <span className="text-xs text-muted-foreground">
                  · {promocoes.nCampanhas} campanha
                  {promocoes.nCampanhas > 1 ? "s" : ""} · {promocoes.periodLabel}
                </span>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Quanto você investe pra vender e o retorno. Acima de 20% do
                faturamento começa a corroer a margem — corte o de baixo ROAS.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi
                  icon={Wallet}
                  label="Investido pela loja"
                  value={fmtBRL(promocoes.investimentoLojas)}
                  hint={
                    marketingPct != null
                      ? `≈ ${fmtPct(marketingPct)} do faturamento`
                      : undefined
                  }
                  highlight
                  explicacao="Quanto a loja tirou do próprio bolso em promoções e anúncios no iFood. Acima de ~20% do faturamento começa a comer a margem."
                />
                <Kpi
                  icon={TrendingUp}
                  label="Retorno (ROAS)"
                  value={
                    promocoes.roasLojas != null
                      ? `${promocoes.roasLojas.toFixed(2)}×`
                      : "—"
                  }
                  hint="vendas por R$ investido"
                  explicacao="Quanto de venda cada R$ 1 investido em promoção trouxe. 6× = pra cada R$ 1, R$ 6 em vendas. Abaixo de ~3× a campanha rende pouco — vale rever."
                />
                <Kpi
                  icon={ShoppingBag}
                  label="Co-financiado"
                  value={fmtBRL(
                    promocoes.investimentoIfood + promocoes.investimentoIndustria,
                  )}
                  hint="iFood + indústria"
                  explicacao="Parte das promoções bancada pelo iFood e pela indústria — dinheiro de marketing que impulsiona suas vendas mas NÃO saiu do seu bolso."
                />
                <Kpi
                  icon={Receipt}
                  label="Investimento total"
                  value={fmtBRL(promocoes.investimentoTotal)}
                  hint="loja + rede + parceiros"
                  explicacao="Soma de tudo investido em promoção no período: o que a loja pôs + a rede + iFood/indústria. É o esforço de marketing total por trás das vendas."
                />
              </div>
            </section>
          )}

          {/* ── Pontos de atenção ── */}
          {atencao.length > 0 && (
            <section className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-600" />
                <h3 className="text-sm font-semibold">Pontos de atenção</h3>
              </div>
              <ul className="flex flex-col gap-2">
                {atencao.map((a, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded-md border-l-2 bg-muted/30 px-3 py-2 text-sm"
                    style={{
                      borderLeftColor: a.grave ? "#e11d48" : "#d97706",
                    }}
                  >
                    <span
                      className={`mt-1 size-1.5 shrink-0 rounded-full ${a.grave ? "bg-rose-600" : "bg-amber-600"}`}
                    />
                    <span className="leading-relaxed">{a.texto}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── Recomendação do iFood (plano de ação do Super) ── */}
          {planoIfood && (
            <section className="rounded-xl border border-l-4 border-l-amber-500 bg-amber-50/40 p-5 dark:bg-amber-950/20">
              <div className="flex items-center gap-2">
                <Award className="size-4 text-amber-600" />
                <h3 className="text-sm font-semibold">
                  Recomendação do iFood (Super)
                </h3>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {planoIfood}
              </p>
            </section>
          )}

          {/* ── Sentimento das avaliações (tags do Super) ── */}
          {(elogios.length > 0 || reclamacoes.length > 0) && (
            <section className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Star className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">
                  Sentimento das avaliações
                </h3>
                {superAval && (
                  <span className="text-xs text-muted-foreground">
                    · {superAval.pedidosAvaliados} avaliados
                  </span>
                )}
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                O que os clientes mais elogiam e reclamam da comida. Reclamação
                recorrente é a pista do que ajustar na cozinha.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <TagList
                  title="O que mais elogiam"
                  tags={elogios}
                  tone="pos"
                />
                <TagList
                  title="O que mais reclamam"
                  tags={reclamacoes}
                  tone="neg"
                />
              </div>
            </section>
          )}

          {/* ── Negociações com clientes ── */}
          {negociacoes && negociacoes.totalNegociacoes > 0 && (
            <section className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Handshake className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">
                  Negociações com clientes
                </h3>
                <span className="text-xs text-muted-foreground">
                  · {negociacoes.totalNegociacoes} no período ·{" "}
                  {negociacoes.periodLabel}
                </span>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Quando algo dá errado, quanto você recupera negociando com o
                cliente em vez de perder a venda no reembolso.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi
                  icon={CheckCircle2}
                  label="Cancelamentos evitados"
                  value={fmtNum(negociacoes.cancelamentosEvitados)}
                  hint={`${fmtBRL(negociacoes.valorEvitado)} em vendas salvas`}
                  highlight
                  explicacao="Pedidos que dariam cancelamento/reembolso, mas você negociou com o cliente e SALVOU a venda. Ao lado, o valor em vendas recuperadas."
                />
                <Kpi
                  icon={MousePointerClick}
                  label="Respondidas"
                  value={
                    negociacoes.pctRespondidas != null
                      ? fmtPct(negociacoes.pctRespondidas)
                      : "—"
                  }
                  hint="das negociações"
                  explicacao="Das reclamações abertas pelo cliente, quantas você respondeu no prazo. Não responder = reembolso automático e cliente insatisfeito. Ideal perto de 100%."
                />
                <Kpi
                  icon={Wallet}
                  label="Reembolsos"
                  value={fmtBRL(negociacoes.reembolsoTotal)}
                  hint="devolvido ao cliente"
                  explicacao="Total devolvido ao cliente quando não deu pra resolver de outro jeito. É venda perdida — quanto menor, melhor a operação."
                />
                <Kpi
                  icon={Megaphone}
                  label="Cupons concedidos"
                  value={fmtBRL(negociacoes.cupomTotal)}
                  hint="pra reter o cliente"
                  explicacao="Valor em cupons que você deu pra reter o cliente insatisfeito — alternativa ao reembolso: em vez de devolver dinheiro, incentiva um novo pedido."
                />
              </div>
              {motivosNeg.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Principais motivos de reclamação
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {motivosNeg.map(([nome, n]) => (
                      <span
                        key={nome}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                      >
                        {nome}
                        <span className="tabular-nums opacity-70">{n}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ── Pendente de integração (só quando o relatório está ligado e falta) ── */}
          {enabled.has("ifood_qualidade") && !operacao && (
            <section className="rounded-xl border border-dashed bg-muted/20 p-5">
              <h3 className="text-sm font-semibold text-muted-foreground">
                Ainda não integrado
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Estes dados vêm do relatório{" "}
                <b>&quot;Qualidade da operação&quot;</b> do iFood (modo rede = 1
                arquivo pra todas as lojas). Suba em{" "}
                <a href="/importacao" className="underline">
                  /importacao
                </a>{" "}
                pra preencher automaticamente:
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  "Tempo online %",
                  "Chamados %",
                  "Ranqueamento (Super)",
                  "Tempo de preparo",
                  "Atrasos",
                ].map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-dashed px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </section>
          )}
            </div>
          </details>
        </>
      )}
    </div>
  )
}

/** Ícone de info (i) que mostra a explicação SÓ ao passar o mouse nele. */
function InfoTip({ texto }: { texto: string }) {
  return (
    <span className="group/info relative inline-flex cursor-help">
      <Info className="size-3 opacity-50 transition-opacity hover:opacity-100" />
      <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden w-52 -translate-x-1/2 rounded-lg border bg-card p-2.5 text-left text-[11px] font-normal normal-case leading-snug tracking-normal text-muted-foreground shadow-lg group-hover/info:block">
        {texto}
      </div>
    </span>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  highlight,
  explicacao,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  hint?: string
  highlight?: boolean
  /** Quando presente, mostra ícone de info + tooltip no hover (igual à Saúde). */
  explicacao?: string
}) {
  return (
    <div
      className={`diag-hover rounded-lg border p-3 ${
        explicacao ? "relative hover:z-10 " : ""
      }${highlight ? "border-primary/30 bg-primary/5" : "bg-muted/30"}`}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" />
        <span className="text-[10px] font-semibold uppercase tracking-wide">
          {label}
        </span>
        {explicacao && <InfoTip texto={explicacao} />}
      </div>
      <p className="mt-1.5 text-lg font-bold tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Veredito no topo: nota de saúde (0-100) + foco prioritário numa frase. */
function Veredito({
  score,
  tone,
  titulo,
  foco,
}: {
  score: number
  tone: "bom" | "atencao" | "critico"
  titulo: string
  foco: string | null
}) {
  const t = {
    bom: {
      ring: "text-emerald-500",
      badge:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
      border: "border-l-emerald-500",
      icon: "text-emerald-600",
    },
    atencao: {
      ring: "text-amber-500",
      badge:
        "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
      border: "border-l-amber-500",
      icon: "text-amber-600",
    },
    critico: {
      ring: "text-rose-500",
      badge:
        "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
      border: "border-l-rose-500",
      icon: "text-rose-600",
    },
  }[tone]
  const R = 26
  const C = 2 * Math.PI * R
  const dash = (score / 100) * C
  return (
    <section
      className={`diag-foco flex flex-wrap items-center gap-4 rounded-xl border border-l-4 bg-card p-4 shadow-sm ${t.border}`}
    >
      <div className="relative shrink-0">
        <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
          <circle
            cx="32"
            cy="32"
            r={R}
            fill="none"
            strokeWidth="6"
            style={{ stroke: "var(--border)" }}
          />
          <circle
            cx="32"
            cy="32"
            r={R}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            stroke="currentColor"
            className={t.ring}
            strokeDasharray={`${dash} ${C - dash}`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold tabular-nums">{score}</span>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Activity className={`size-4 ${t.icon}`} />
          <h3 className="text-sm font-semibold">{titulo}</h3>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${t.badge}`}
          >
            saúde {score}/100
          </span>
        </div>
        {foco && (
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">Foco: </span>
            {foco}
          </p>
        )}
      </div>
    </section>
  )
}

/**
 * Etapa do funil como card com preenchimento vermelho proporcional ao % de
 * quem chegou até ali (estilo iFood): topo com contagem+rótulo, base preenchida
 * com o %.
 */
/** Selo do programa Super Restaurante do iFood. Dourado quando é Super; cinza
 *  quando "Não elegível". */
function SuperBadge({ status }: { status: string }) {
  const naoElegivel = /não eleg|nao eleg/i.test(status)
  const nivel = status.replace(/nivel/i, "Nível")
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
        naoElegivel
          ? "bg-muted text-muted-foreground"
          : "bg-gradient-to-r from-amber-400 to-amber-500 text-white shadow-sm"
      }`}
      title="Programa Super Restaurante do iFood"
    >
      <Star className={`size-3 ${naoElegivel ? "" : "fill-white"}`} />
      Super Restaurante · {naoElegivel ? "não elegível" : nivel}
    </span>
  )
}

function TagList({
  title,
  tags,
  tone,
}: {
  title: string
  tags: [string, number][]
  tone: "pos" | "neg"
}) {
  const pos = tone === "pos"
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {tags.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem menções</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tags.map(([nome, n]) => (
            <span
              key={nome}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium capitalize ${
                pos
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                  : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400"
              }`}
            >
              {nome}
              <span className="tabular-nums opacity-70">{n}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted/50 px-2 py-1">
      <span>{label}:</span>
      <span className="font-semibold text-foreground tabular-nums">{value}</span>
    </span>
  )
}

function Health({
  label,
  value,
  meta,
  lowerIsBetter,
  fmt,
  explicacao,
}: {
  label: string
  value: number | null
  meta: number
  lowerIsBetter: boolean
  fmt: (n: number) => string
  explicacao: string
}) {
  const ok =
    value == null ? true : lowerIsBetter ? value <= meta : value >= meta
  let tone: "ok" | "warn" | "bad" = "ok"
  if (value != null && !ok) {
    const r = lowerIsBetter ? value / meta : meta / value
    tone = r > 1.5 ? "bad" : "warn"
  }
  // Barra: proporção do valor em relação à meta (cor carrega o bom/ruim).
  const fill =
    value == null ? 0 : Math.max(6, Math.min(100, (value / meta) * 100))
  const T = {
    ok: {
      card: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20",
      val: "text-emerald-700 dark:text-emerald-400",
      bar: "bg-emerald-500",
      ic: "text-emerald-600 dark:text-emerald-400",
      alerta: false,
    },
    warn: {
      card: "border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20",
      val: "text-amber-700 dark:text-amber-400",
      bar: "bg-amber-500",
      ic: "text-amber-600 dark:text-amber-400",
      alerta: true,
    },
    bad: {
      card: "border-rose-200 bg-rose-50/60 dark:border-rose-900/40 dark:bg-rose-950/20",
      val: "text-rose-700 dark:text-rose-400",
      bar: "bg-rose-500",
      ic: "text-rose-600 dark:text-rose-400",
      alerta: true,
    },
  }[tone]
  const Icon = T.alerta ? AlertTriangle : CheckCircle2
  return (
    <div
      className={`diag-hover relative rounded-xl border p-3 hover:z-10 ${T.card}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
          <InfoTip texto={explicacao} />
        </div>
        <Icon className={`size-3.5 shrink-0 ${T.ic}`} />
      </div>
      <p className={`mt-1 text-xl font-bold tabular-nums ${T.val}`}>
        {value == null ? "—" : fmt(value)}
      </p>
      <p className="text-[10px] text-muted-foreground">
        ideal {lowerIsBetter ? "≤" : "≥"} {fmt(meta)}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
        <div
          className={`diag-bar-fill h-full rounded-full ${T.bar}`}
          style={{ width: `${fill}%` }}
        />
      </div>
    </div>
  )
}
