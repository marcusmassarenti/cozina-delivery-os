import { Trophy } from "lucide-react"

import { assertCanView } from "@/lib/auth/permissions"
import { painelComercial } from "@/lib/data/carteira-comercial"
import { fmtBRL, fmtNum } from "@/lib/format"
import { formatRangeLabel } from "@/lib/period"
import { readPeriod } from "@/lib/period-helpers"
import { PeriodSelector } from "@/components/shared/period-selector"
import { TourButton } from "@/components/onboarding/tour-button"
import { TOUR_COMERCIAL } from "../_tours"

export const metadata = { title: "Comercial · Delivery OS" }

const MEDALHA = ["🥇", "🥈", "🥉"]

/**
 * T7 — quem vendeu mais no período.
 *
 * ⚠️ Todo dinheiro nesta tela é MENSALIDADE DA AGÊNCIA, nunca faturamento de
 * loja. A palavra aparece por extenso em cada rótulo de propósito: as duas
 * grandezas convivem no mesmo sistema e diferem por duas ordens de grandeza.
 */
export default async function ComercialPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; inicio?: string; fim?: string }>
}) {
  await assertCanView("unidades")
  const sp = await searchParams
  const { range } = readPeriod(sp)
  const p = await painelComercial(range)
  const periodo = formatRangeLabel(range)

  const podio = p.vendedores.filter((v) => v.lojas > 0).slice(0, 3)
  const maiorMes = Math.max(...p.meses.map((m) => m.valor), 0)

  return (
    <div className="flex flex-1 flex-col gap-4 bg-muted/30 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Trophy className="size-6 text-muted-foreground" />
            Comercial
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Quem vendeu quanto de mensalidade no período.
          </p>
          <div className="mt-2">
            <TourButton steps={TOUR_COMERCIAL} />
          </div>
        </div>
        <PeriodSelector current={range} />
      </div>

      <div data-tour="com-kpis" className="grid gap-3 sm:grid-cols-3">
        <Kpi rotulo={`Lojas vendidas · ${periodo}`} valor={fmtNum(p.totalVendas)} />
        <Kpi
          rotulo="Mensalidade vendida"
          valor={fmtBRL(p.totalValor)}
          nota="soma do que a agência passa a cobrar por mês"
          destaque
        />
        <Kpi
          rotulo="Sem vendedor"
          valor={fmtNum(p.semVendedor)}
          nota={
            p.semVendedor > 0
              ? "não entram em ranking nenhum"
              : "todas atribuídas"
          }
          alerta={p.semVendedor > 0}
        />
      </div>

      {podio.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {podio.map((v, i) => (
            <div
              key={v.id}
              className={`flex flex-col gap-0.5 rounded-xl border bg-card px-4 py-3 ${
                i === 0 ? "border-amber-300 dark:border-amber-700" : ""
              }`}
            >
              <span className="text-lg leading-none">{MEDALHA[i]}</span>
              <span className="mt-1 truncate text-sm font-semibold">{v.nome}</span>
              <span className="text-xl font-semibold tabular-nums">
                {fmtBRL(v.mensalidadeVendida)}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {v.lojas} loja{v.lojas === 1 ? "" : "s"} · ticket{" "}
                {fmtBRL(v.ticketMedio)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div data-tour="com-ranking" className="rounded-xl border bg-card">
        <div className="border-b px-4 py-2.5">
          <h2 className="text-sm font-semibold">Ranking do período</h2>
        </div>
        {p.vendedores.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum vendedor cadastrado. Crie o primeiro na tela de Onboarding.
          </p>
        ) : (
          <ul className="divide-y">
            {p.vendedores.map((v, i) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm"
              >
                <span className="w-5 text-xs tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <span className="min-w-[120px] flex-1 truncate font-medium">
                  {v.nome}
                  {!v.ativo && (
                    <span className="ml-1.5 text-[10px] uppercase text-muted-foreground">
                      inativo
                    </span>
                  )}
                </span>
                <Coluna rotulo="lojas" valor={fmtNum(v.lojas)} />
                <Coluna rotulo="ticket" valor={fmtBRL(v.ticketMedio)} />
                {/* Dito na linha, não escondido: o ticket é calculado só sobre
                    as lojas com mensalidade preenchida, então falta de cadastro
                    não pode passar por venda menor. */}
                {v.semValor > 0 && (
                  <span className="text-[11px] text-amber-700 dark:text-amber-400">
                    {v.semValor} sem mensalidade
                  </span>
                )}
                <span className="w-28 text-right font-semibold tabular-nums">
                  {fmtBRL(v.mensalidadeVendida)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div data-tour="com-evolucao" className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">
          Mensalidade vendida · 12 meses
        </h2>
        {maiorMes <= 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma venda registrada ainda. A data e a mensalidade são
            preenchidas na tela de Onboarding.
          </p>
        ) : (
          <div className="flex h-40 items-end gap-1.5">
            {p.meses.map((m) => (
              <div
                key={m.mes}
                className="group flex h-full flex-1 flex-col items-center gap-1"
                title={`${m.rotulo}: ${fmtBRL(m.valor)} · ${m.vendas} loja(s)`}
              >
                {/* Altura em % precisa de pai com altura resolvida — este
                    flex-1 dentro do h-40 dá isso. */}
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t bg-primary/80 transition-colors group-hover:bg-primary"
                    style={{ height: `${(m.valor / maiorMes) * 100}%` }}
                  />
                </div>
                <span className="text-[9px] text-muted-foreground">
                  {m.rotulo}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Coluna({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <span className="flex min-w-[64px] flex-col">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {rotulo}
      </span>
      <span className="text-xs tabular-nums">{valor}</span>
    </span>
  )
}

function Kpi({
  rotulo,
  valor,
  nota,
  destaque,
  alerta,
}: {
  rotulo: string
  valor: string
  nota?: string
  destaque?: boolean
  alerta?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border bg-card px-4 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {rotulo}
      </span>
      <span
        className={`tabular-nums font-semibold ${destaque ? "text-xl" : "text-lg"}`}
      >
        {valor}
      </span>
      {nota && (
        <span
          className={`text-[11px] ${alerta ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}
        >
          {nota}
        </span>
      )}
    </div>
  )
}
