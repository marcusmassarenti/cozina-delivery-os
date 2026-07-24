import {
  Bike,
  CalendarDays,
  Info,
  Megaphone,
  Receipt,
  Ticket,
  Truck,
  Wallet,
} from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { KeetaRoiCard } from "@/components/keeta/keeta-roi-card"
import { RecebiveisPlataforma } from "@/components/keeta/recebiveis-plataforma"
import {
  getKeetaRepasseResumo,
  getKeetaFaturaTaxasForMonth,
} from "@/lib/data/keeta-repasses"
import {
  getAntecipacaoFeeByUnits,
  getCancelamentoCestaForMonth,
} from "@/lib/data/ifood-imported"
import { getPagamentoResumoForMonth } from "@/lib/data/ifood-pedidos"
import { getKeetaPromocaoResumo } from "@/lib/data/keeta-promocoes"
import { getKeetaPedidoResumoForMonth } from "@/lib/data/keeta-pedidos"
import { getNinefoodResumoForMonth } from "@/lib/data/ninefood-imported"
import { getDailyReportMatrix } from "@/lib/data/relatorio-diario"
import { getDeliveryFeeForMonth } from "@/lib/data/taxa-entrega"
import { getUnitCostBreakdown } from "@/lib/data/unit-costs"
import type { UnitMonthly } from "@/lib/mock-monthly"
import { fmtBRL, fmtBRLShort, fmtNum, fmtPct } from "@/lib/format"

import { UnitCostsEditor } from "./unit-costs-editor"
import { BrutoBreakdown } from "./bruto-breakdown"
import { DreDetalhado, type DrePlat } from "./dre-detalhado"

const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
]

// Ordem cronológica dos turnos (o iFood manda fora de ordem / por volume).
const TURNO_ORDEM = [
  "cafe da manha",
  "almoco",
  "cafe da tarde",
  "jantar",
  "madrugada",
]
function turnoRank(chave: string): number {
  const norm = chave
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
  const i = TURNO_ORDEM.indexOf(norm)
  return i === -1 ? 99 : i
}

/**
 * Aba Financeiro da loja — o DRE completo num lugar só (funde Receita +
 * Financeiro + Custos). Tudo derivado do `m` mesclado (3 plataformas), então
 * bate com o Hero. CMV/operação editáveis inline. Embaixo: descontos do
 * iFood, VR por bandeira, mix de pagamento e promoções (do relatório de
 * pedidos iFood).
 */
export async function FinanceiroLojaTab({
  unitId,
  monthly,
  year,
  month,
}: {
  unitId: string
  monthly: UnitMonthly
  year: number
  month: number
}) {
  const m = monthly
  const [
    pagamento,
    deliveryFee,
    daily,
    nineResumo,
    antecipMap,
    keetaPromo,
    costBreakdown,
    keetaRepasse,
    keetaPed,
    keetaFaturaTaxas,
    cancelCesta,
  ] = await Promise.all([
    getPagamentoResumoForMonth(unitId, year, month),
    getDeliveryFeeForMonth(unitId, year, month),
    getDailyReportMatrix(year, month, "todas", [
      { id: unitId, code: "", name: "" },
    ]),
    getNinefoodResumoForMonth(unitId, year, month),
    getAntecipacaoFeeByUnits([unitId], year, month),
    getKeetaPromocaoResumo([unitId], year, month),
    getUnitCostBreakdown(unitId, year, month),
    getKeetaRepasseResumo(year, month, unitId),
    getKeetaPedidoResumoForMonth(unitId, year, month),
    getKeetaFaturaTaxasForMonth(unitId, year, month),
    getCancelamentoCestaForMonth(unitId, year, month),
  ])
  const antecipFee = antecipMap.get(unitId) ?? 0
  const dailyFat = daily.units[0]?.faturamento ?? {}

  const bruto = m.faturamentoBruto
  const liquido = m.totalLiquido
  // Plataformas que entram no consolidado (bruto/líquido por app) — pro
  // "Para onde vai o bruto" com seletor de plataforma.
  const brutoPlatforms = m.platforms
    .filter((p) => p.bruto > 0)
    .map((p) => ({
      id: p.id,
      bruto: p.bruto,
      liquido: p.liquido,
      promocoesLoja: p.promocoesLoja ?? 0,
      recebidoDireto: p.recebidoDireto ?? 0,
    }))
  // 99 Food / Keeta com faturamento: a abertura detalhada abaixo é só do iFood,
  // então avisamos que essas plataformas não trazem esse nível de detalhe.
  const outrasComBruto = m.platforms.filter(
    (p) => (p.id === "99food" || p.id === "keeta") && p.bruto > 0,
  )
  const outrasLabel = outrasComBruto
    .map((p) => (p.id === "99food" ? "99 Food" : "Keeta"))
    .join(" e ")
  const cmv = m.custoProdutosCozina + (m.custoProdutosLoja ?? 0)
  const operacao = m.custoOperacao

  // VR líquido (iFood, à parte) = recebido − 8% de taxa.
  const vrLiquido = Math.max(0, m.vrRecebido - m.vrTaxaMedia8)
  // De onde vem o VR (pra abrir no DRE): bruto vendido, taxa (estimada 8%),
  // líquido recebido e a quebra por bandeira (do relatório de pedidos iFood).
  const vrInfo =
    vrLiquido > 0
      ? {
          bruto: m.vrRecebido,
          taxa: m.vrTaxaMedia8,
          liquido: vrLiquido,
          porBandeira: pagamento.hasData ? pagamento.porBandeira : [],
        }
      : undefined

  // Abertura das taxas por plataforma pro DRE detalhado. iFood vem itemizado
  // do `m`; 99 Food do seu resumo (comissão/taxa/promoções); Keeta só o total.
  const buildPlat = (
    id: PlatformId,
    name: string,
    itens: { label: string; value: number }[],
    vr: number,
    // Só o iFood traz (da Conciliação): R$ e qtd de pedidos cancelados, pro
    // DRE abrir em "Vendas totais − cancelados" igual ao portal.
    cancel?: { valor: number; qtd: number },
  ): DrePlat | null => {
    const p = m.platforms.find((x) => x.id === id)
    if (!p || p.bruto <= 0) return null
    // Taxas reais: sem o recebido-direto (que tem linha própria no DRE).
    const taxaTotal = Math.max(
      0,
      p.bruto - p.liquido - (p.recebidoDireto ?? 0),
    )
    const lista: { label: string; value: number; credit?: boolean }[] =
      itens.filter((i) => i.value > 0)
    const resto = taxaTotal - lista.reduce((a, i) => a + i.value, 0)
    if (resto > 0.5) {
      lista.push({ label: "Cancelamentos / outros", value: resto })
    } else if (resto < -0.5) {
      // Descontos itemizados > taxa líquida real → a diferença é o que a
      // plataforma devolveu (promoção financiada por ela, estorno). Entra
      // como crédito pra abertura fechar com a linha de taxas.
      lista.push({
        label: "Créditos / estornos da plataforma",
        value: -resto,
        credit: true,
      })
    }
    return {
      id,
      name,
      bruto: p.bruto,
      liquido: p.liquido,
      taxaTotal,
      vrLiquido: vr,
      recebidoDireto: p.recebidoDireto ?? 0,
      perdaCancelamento: cancel?.valor ?? 0,
      cancelQtd: cancel?.qtd ?? 0,
      itens: lista,
    }
  }
  // Quebra da taxa da Keeta — prioridade: Fatura (oficial) → Pedidos recentes
  // → resto. NÃO muda o total (bruto − líquido); só detalha a abertura.
  const keetaItens: { label: string; value: number }[] = keetaFaturaTaxas.hasData
    ? [
        { label: "Comissão", value: keetaFaturaTaxas.comissao },
        { label: "Taxa de distância", value: keetaFaturaTaxas.taxaDistancia },
        { label: "Taxa de pagamento online", value: keetaFaturaTaxas.taxaPagamentoOnline },
        { label: "Saque antecipado", value: keetaFaturaTaxas.taxaSaqueAntecipado },
        { label: "Taxa de serviço mensal", value: keetaFaturaTaxas.taxaServicoMensal },
        { label: "Publicidade / marketing", value: keetaFaturaTaxas.publicidade },
        { label: "Ajuste de comissão", value: keetaFaturaTaxas.ajusteComissao },
        { label: "Serviço da Ajuda", value: keetaFaturaTaxas.deducaoAjuda },
        { label: "Promoções (loja bancou)", value: keetaFaturaTaxas.promoLoja },
      ]
    : keetaPed.hasData
      ? [
          { label: "Comissão", value: keetaPed.comissaoBasica },
          { label: "Taxa de distância", value: keetaPed.taxaDistancia },
          { label: "Taxa de pagamento online", value: keetaPed.taxaPagamentoOnline },
          { label: "Saque antecipado", value: keetaPed.taxaSaqueAntecipado },
          { label: "Promoções (loja bancou)", value: keetaPed.promoLoja },
        ]
      : []

  const dreTaxas = [
    buildPlat(
      "ifood",
      "iFood",
      [
        { label: "Taxa de entrega", value: m.taxaEntregaIfood },
        { label: "Comissão + serviço", value: m.taxaComissaoIfood },
        { label: "Promoções (loja bancou)", value: m.promocoes },
        { label: "Serviços logísticos", value: m.servicosLogisticos },
        { label: "Outros / anúncios", value: m.outrosDescontosIfood },
      ],
      vrLiquido,
      cancelCesta.valor > 0
        ? { valor: cancelCesta.valor, qtd: cancelCesta.qtd }
        : undefined,
    ),
    buildPlat(
      "99food",
      "99 Food",
      [
        { label: "Comissão", value: nineResumo.comissaoRs },
        { label: "Taxa de pagamento", value: nineResumo.taxaCanalPagamentoRs },
        { label: "Promoções", value: nineResumo.promocoesRs },
      ],
      0,
    ),
    buildPlat("keeta", "Keeta", keetaItens, 0),
  ].filter((p): p is DrePlat => p !== null)

  const descontos = [
    { label: "Taxa de entrega", value: m.taxaEntregaIfood },
    { label: "Comissão + serviço", value: m.taxaComissaoIfood },
    { label: "Promoções (loja bancou)", value: m.promocoes },
    { label: "Serviços logísticos", value: m.servicosLogisticos },
    { label: "Outros / anúncios", value: m.outrosDescontosIfood },
  ].filter((d) => d.value > 0)

  return (
    <div className="space-y-4">
      {/* DRE da loja */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DreDetalhado
            platforms={dreTaxas}
            totalBruto={bruto}
            totalLiquido={liquido}
            cmv={cmv}
            operacao={operacao}
            cmvCats={costBreakdown.categories
              .filter((c) => c.tipo === "cmv")
              .map((c) => ({ nome: c.nome, valor: c.valor }))}
            operacaoCats={costBreakdown.categories
              .filter((c) => c.tipo === "operacao")
              .map((c) => ({ nome: c.nome, valor: c.valor }))}
            periodo={`${MESES_PT[month - 1]} de ${year}`}
            vrInfo={vrInfo}
            antecipacaoIfood={antecipFee}
            showPdf={false}
          />
        </div>

        {/* Custos editáveis */}
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold">Custos da loja</h3>
          {/* key estável (só unidade/mês): o editor é otimista e dono do próprio
              estado. Assim o router.refresh (que atualiza a DRE ao lado) NÃO
              remonta o card nem fecha a seção aberta. Só remonta ao trocar de
              mês/unidade, quando deve reler os dados. */}
          <UnitCostsEditor
            key={`${unitId}-${year}-${month}`}
            unitId={unitId}
            year={year}
            month={month}
            cmvLegacy={m.custoProdutosCozina}
            operacaoLegacy={operacao}
            breakdown={costBreakdown}
          />
          <p className="mt-3 text-[11px] text-muted-foreground">
            O bruto/líquido vêm dos relatórios; CMV e operação você lança aqui —
            crie categorias pra detalhar (ex.: bebidas, aluguel, funcionários).
          </p>
        </div>
      </div>

      {/* Recebíveis — quando o dinheiro cai (repasse da Fatura da Keeta) */}
      {keetaRepasse.ciclos.length > 0 && (
        <RecebiveisPlataforma keeta={keetaRepasse} />
      )}

      {/* Custo de entrega (logístico) — por plataforma */}
      {deliveryFee.total > 0 && (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Bike className="size-4 text-amber-600" />
            <h3 className="text-sm font-semibold">Custo de entrega (logístico)</h3>
            <span className="ml-auto text-base font-bold tabular-nums text-rose-700 dark:text-rose-400">
              − {fmtBRL(deliveryFee.total)}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <DeliveryItem platform="ifood" value={deliveryFee.ifood} />
            <DeliveryItem platform="99food" value={deliveryFee.ninefood} />
            <DeliveryItem platform="keeta" value={deliveryFee.keeta} />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {fmtPct(bruto > 0 ? (deliveryFee.total / bruto) * 100 : 0)} do bruto ·
            já está dentro das taxas das plataformas (no DRE acima).
          </p>
        </div>
      )}

      {/* Gráficos: composição do bruto (por plataforma) + faturamento dia-a-dia */}
      <div className="grid gap-4 lg:grid-cols-2">
        <BrutoBreakdown
          platforms={brutoPlatforms}
          totalBruto={bruto}
          totalLiquido={liquido}
          cmv={cmv}
          operacao={operacao}
        />
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Faturamento por dia</h3>
          </div>
          <DailyChart dias={daily.days} valores={dailyFat} />
        </div>
      </div>

      {/* Aviso: o detalhamento abaixo é exclusivo do iFood */}
      {outrasComBruto.length > 0 && (descontos.length > 0 || pagamento.hasData) && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            A abertura detalhada abaixo (taxas, vale-refeição, formas de
            pagamento e turnos) vem só do relatório do <b>iFood</b>.{" "}
            {outrasLabel} não fornece{outrasComBruto.length > 1 ? "m" : ""} esse
            nível de detalhe — o faturamento total dessas plataformas já está no
            DRE e no &quot;Para onde vai o bruto&quot;.
          </span>
        </div>
      )}

      {/* Descontos das plataformas (detalhe iFood) */}
      {descontos.length > 0 && (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Receipt className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Para onde foram as taxas</h3>
            <span className="ml-auto">
              <PlatformLogo platform="ifood" size="sm" />
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {descontos.map((d) => {
              const totalTaxas = descontos.reduce((a, x) => a + x.value, 0)
              const share = totalTaxas > 0 ? (d.value / totalTaxas) * 100 : 0
              return (
                <div
                  key={d.label}
                  className="rounded-lg border bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {d.label}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-rose-700 dark:text-rose-400">
                      − {fmtBRL(d.value)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-rose-400/70"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                      {share.toFixed(0)}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          <TotalRow
            label="Total das taxas"
            value={`− ${fmtBRL(descontos.reduce((a, d) => a + d.value, 0))}`}
            valueClass="text-rose-700 dark:text-rose-400"
          />
        </div>
      )}

      {/* VR + mix + promoções (do relatório de pedidos iFood) */}
      {pagamento.hasData && (
        <div className="grid gap-4 lg:grid-cols-2">
          {pagamento.vrPedidos > 0 && (
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Ticket className="size-4 text-violet-600" />
                <h3 className="text-sm font-semibold">
                  Vale-Refeição por bandeira
                </h3>
                <span className="ml-auto">
                  <PlatformLogo platform="ifood" size="sm" />
                </span>
              </div>
              {pagamento.porBandeira.map((b) => (
                <MiniRow
                  key={b.bandeira}
                  label={b.bandeira}
                  value={`${fmtBRL(b.valor)} · ${fmtNum(b.pedidos)} ped`}
                />
              ))}
              <TotalRow
                value={`${fmtBRL(pagamento.vrValor)} · ${fmtNum(pagamento.vrPedidos)} ped`}
              />
              <p className="mt-2 text-[11px] text-muted-foreground">
                {fmtPct(pagamento.vrPct)} do pago · não entra no faturamento.
              </p>
            </div>
          )}
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Wallet className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Mix de pagamento</h3>
              <span className="ml-auto">
                <PlatformLogo platform="ifood" size="sm" />
              </span>
            </div>
            {pagamento.mix.map((mx) => {
              const pct =
                pagamento.totalValor > 0
                  ? (mx.valor / pagamento.totalValor) * 100
                  : 0
              return (
                <MiniRow
                  key={mx.grupo}
                  label={mx.grupo}
                  value={`${fmtBRL(mx.valor)} · ${pct.toFixed(0)}%`}
                />
              )
            })}
            <TotalRow value={`${fmtBRL(pagamento.totalValor)} · 100%`} />
          </div>
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Megaphone className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Promoções (quem bancou)</h3>
              <span className="ml-auto">
                <PlatformLogo platform="ifood" size="sm" />
              </span>
            </div>
            <MiniRow label="iFood" value={fmtBRL(pagamento.incentivoIfood)} />
            <MiniRow
              label="Loja (investiu)"
              value={fmtBRL(pagamento.incentivoLoja)}
            />
            <TotalRow
              label="Total em promoções"
              value={fmtBRL(pagamento.incentivoIfood + pagamento.incentivoLoja)}
            />
            <p className="mt-2 text-[11px] text-muted-foreground">
              &quot;Loja&quot; = promoção que a própria loja bancou (saiu do
              bolso dela pra atrair pedido).
            </p>
          </div>
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Truck className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Por turno</h3>
              <span className="ml-auto">
                <PlatformLogo platform="ifood" size="sm" />
              </span>
            </div>
            {[...pagamento.porTurno]
              .sort((a, b) => turnoRank(a.chave) - turnoRank(b.chave))
              .map((tn) => (
                <MiniRow
                  key={tn.chave}
                  label={tn.chave}
                  value={`${fmtNum(tn.pedidos)} ped`}
                />
              ))}
            <TotalRow
              value={`${fmtNum(
                pagamento.porTurno.reduce((a, t) => a + t.pedidos, 0),
              )} ped`}
            />
          </div>
        </div>
      )}

      {/* ROI das campanhas da Keeta (só se a loja tiver "Dados da promoção") */}
      {keetaPromo.hasData && (
        <KeetaRoiCard promocoes={keetaPromo} showEmptyCta={false} />
      )}
    </div>
  )
}

function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1">
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <span className="shrink-0 text-xs font-medium tabular-nums">{value}</span>
    </div>
  )
}

/** Linha de total no rodapé de um card (negrito, separada por borda). */
function TotalRow({
  label = "Total",
  value,
  valueClass,
}: {
  label?: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="mt-1.5 flex items-baseline justify-between gap-2 border-t pt-2">
      <span className="text-xs font-semibold">{label}</span>
      <span className={`shrink-0 text-sm font-bold tabular-nums ${valueClass ?? ""}`}>
        {value}
      </span>
    </div>
  )
}

function DeliveryItem({
  platform,
  value,
}: {
  platform: PlatformId
  value: number
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2">
      <PlatformLogo platform={platform} size="sm" />
      <span
        className={`text-sm font-semibold tabular-nums ${
          value > 0 ? "" : "text-muted-foreground/50"
        }`}
      >
        {value > 0 ? fmtBRL(value) : "—"}
      </span>
    </div>
  )
}

function DailyChart({
  dias,
  valores,
}: {
  dias: number[]
  valores: Record<number, number>
}) {
  const max = Math.max(...dias.map((d) => valores[d] ?? 0), 1)
  const total = dias.reduce((a, d) => a + (valores[d] ?? 0), 0)
  if (total <= 0) {
    return (
      <p className="text-xs text-muted-foreground">Sem dado diário no mês.</p>
    )
  }
  return (
    <div>
      <div className="relative flex h-28 items-end gap-px">
        {dias.map((d) => {
          const v = valores[d] ?? 0
          const h = v > 0 ? Math.max(3, (v / max) * 100) : 0
          return (
            <div
              key={d}
              className="group/bar relative flex-1 rounded-t bg-emerald-500/70 transition-colors hover:z-20 hover:bg-emerald-500"
              style={{ height: `${h}%` }}
            >
              {v > 0 && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border bg-card px-2 py-1 text-[11px] font-medium text-foreground shadow-md group-hover/bar:block">
                  Dia {String(d).padStart(2, "0")}: {fmtBRL(v)}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-muted-foreground">
        <span>dia 01</span>
        <span>
          {fmtBRLShort(total)} no mês · pico {fmtBRLShort(max)}
        </span>
        <span>dia {dias.length}</span>
      </div>
    </div>
  )
}
