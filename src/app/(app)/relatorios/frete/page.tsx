import Link from "next/link"
import { ArrowLeft, Truck, AlertTriangle, Gift } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { ExportPdfButton } from "@/components/shared/export-pdf-button"
import { ReportBrandLogo } from "@/components/report-brand-logo"
import { LojaFilter } from "@/components/shared/loja-filter"
import { PeriodSelector } from "@/components/shared/period-selector"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import { getRelatorioFrete } from "@/lib/data/frete-faixas"
import { getVisibleUnits } from "@/lib/data/units"
import { assertCanView } from "@/lib/auth/permissions"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import { formatRangeLabel } from "@/lib/period"
import { readPeriod } from "@/lib/period-helpers"

const NOME: Record<string, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
  cardapioweb: "Cardápio Web",
}

export default async function FretePage({
  searchParams,
}: {
  searchParams: Promise<{
    periodo?: string
    inicio?: string
    fim?: string
    lojas?: string
  }>
}) {
  const sp = await searchParams
  await assertCanView("relatorios")
  const { range: periodRange } = readPeriod(sp)

  const allUnits = (await getVisibleUnits())
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, code: u.code, name: u.name }))
  const lojaCodes = (sp.lojas?.split(",") ?? []).filter(Boolean)
  const escolhidas =
    lojaCodes.length > 0
      ? allUnits.filter((u) => lojaCodes.includes(u.code))
      : allUnits

  const [periods, rel] = await Promise.all([
    getAvailablePeriods(),
    getRelatorioFrete(
      escolhidas.map((u) => u.id),
      periodRange.start,
      periodRange.end,
    ),
  ])

  const plataformas = [...new Set(rel.faixas.map((f) => f.plataforma))]
  const pctGratis =
    rel.totalPedidos > 0 ? (rel.pedidosGratis / rel.totalPedidos) * 100 : 0

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            href="/relatorios"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Hub de Relatórios
          </Link>
          <div className="mt-1 flex items-center gap-2">
            <Truck className="size-5 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">
              Faixas de frete
            </h1>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {escolhidas.length} loja{escolhidas.length === 1 ? "" : "s"} ·{" "}
            {formatRangeLabel(periodRange)} · {fmtNum(rel.totalPedidos)} pedidos
            com taxa registrada
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportBrandLogo />
          <LojaFilter
            units={allUnits.map((u) => ({ code: u.code, name: u.name }))}
          />
          <PeriodSelector current={periodRange} options={periods} enableRange />
          <ExportPdfButton />
        </div>
      </div>

      {/* A ressalva mais importante da tela, e por isso fica no topo: taxa não
          é raio. A mesma taxa cobre distâncias diferentes (2,5 km e 3 km custam
          os dois R$ 6,99 na configuração do iFood) e cada loja tem sua tabela.
          Sem este aviso o lojista lê "faixa" como "anel de distância". */}
      <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-400">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <span>
          <strong>Faixa de taxa não é raio de distância.</strong> A mesma taxa
          costuma cobrir distâncias diferentes, e cada loja tem sua própria
          tabela de frete — R$ 6,99 numa loja não é a mesma distância que em
          outra. Use as faixas pra ler o comportamento de compra, não pra medir
          quilometragem.
        </span>
      </div>

      {rel.faixas.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm font-medium">
            Nenhum pedido com taxa de entrega no período
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            No iFood a taxa por pedido só vem do relatório de{" "}
            <strong>Pedidos</strong> (a API não entrega esse campo). Keeta,
            99 Food e Cardápio Web trazem sozinhos.
          </p>
        </div>
      ) : (
        <>
          {/* Cobertura ANTES dos números. Uma plataforma com 16 de 26 lojas faz
              o total valer menos — e mostrar o total sem isso é o mesmo erro do
              selo "8/14" e da média por dia contando dia sem dado. */}
          <div className="rounded-lg border bg-card p-4">
            <h2 className="text-sm font-semibold">Cobertura do período</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Quantas lojas de cada plataforma têm taxa registrada. O que falta
              aqui não entra nos números abaixo.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {rel.cobertura.map((c) => {
                const completa = c.lojasComDado >= c.lojasQueUsam
                return (
                  <div
                    key={c.plataforma}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
                      completa
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400"
                        : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400"
                    }`}
                  >
                    <PlatformLogo platform={c.plataforma} size="sm" />
                    <span>
                      <strong>
                        {c.lojasComDado}/{c.lojasQueUsam}
                      </strong>{" "}
                      lojas · {fmtNum(c.pedidos)} pedidos
                    </span>
                  </div>
                )
              })}
            </div>
            {rel.cobertura.some((c) => c.lojasComDado < c.lojasQueUsam) && (
              <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
                Loja sem taxa registrada não é loja que não cobra frete — é loja
                cujo relatório de Pedidos ainda não foi importado.
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card titulo="Frete arrecadado" valor={fmtBRL(rel.totalFrete)} />
            <Card
              titulo="Pedidos com frete grátis"
              valor={fmtNum(rel.pedidosGratis)}
              rodape={`${fmtPct(pctGratis)} dos pedidos`}
              icone={<Gift className="size-4 text-emerald-600" />}
            />
            <Card
              titulo="Frete médio por pedido"
              valor={fmtBRL(
                rel.totalPedidos > 0 ? rel.totalFrete / rel.totalPedidos : 0,
              )}
            />
          </div>

          {plataformas.map((plat) => {
            const linhas = rel.faixas.filter((f) => f.plataforma === plat)
            const ticketBase = linhas[0]?.ticket ?? 0
            return (
              <div key={plat} className="rounded-lg border bg-card">
                <div className="flex items-center gap-2 border-b px-4 py-3">
                  <PlatformLogo platform={plat as PlatformId} size="sm" />
                  <h2 className="text-sm font-semibold">{NOME[plat] ?? plat}</h2>
                  <span className="text-xs text-muted-foreground">
                    {linhas.length} faixa{linhas.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="px-4 py-2 font-medium">Taxa</th>
                        <th className="px-4 py-2 text-right font-medium">Pedidos</th>
                        <th className="px-4 py-2 text-right font-medium">% dos pedidos</th>
                        <th className="px-4 py-2 text-right font-medium">Ticket médio</th>
                        <th className="px-4 py-2 text-right font-medium">Frete arrecadado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map((f) => {
                        // Ticket bem acima da faixa mais barata é o padrão que
                        // interessa: quem paga frete alto compra mais pra
                        // justificar. Destaco só quando é forte (+25%).
                        const destaque =
                          ticketBase > 0 && f.ticket > ticketBase * 1.25
                        return (
                          <tr
                            key={f.taxa}
                            className="border-b last:border-0 hover:bg-muted/40"
                          >
                            <td className="px-4 py-2 font-medium tabular-nums">
                              {f.taxa === 0 ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                                  <Gift className="size-3.5" />
                                  Grátis
                                </span>
                              ) : (
                                fmtBRL(f.taxa)
                              )}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              {fmtNum(f.pedidos)}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                              {fmtPct(f.pctPedidos)}
                            </td>
                            <td
                              className={`px-4 py-2 text-right tabular-nums ${
                                destaque
                                  ? "font-semibold text-sky-700 dark:text-sky-400"
                                  : ""
                              }`}
                            >
                              {fmtBRL(f.ticket)}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              {fmtBRL(f.totalFrete)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

function Card({
  titulo,
  valor,
  rodape,
  icone,
}: {
  titulo: string
  valor: string
  rodape?: string
  icone?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icone}
        {titulo}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
      {rodape && (
        <p className="mt-0.5 text-xs text-muted-foreground">{rodape}</p>
      )}
    </div>
  )
}
