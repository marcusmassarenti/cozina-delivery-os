import Link from "next/link"
import { AlertTriangle, LayoutDashboard, Target, TrendingDown } from "lucide-react"

import { assertCanView } from "@/lib/auth/permissions"
import { visaoDaCarteira } from "@/lib/data/carteira-visao"
import { fmtBRL, fmtNum } from "@/lib/format"
import { formatRangeLabel } from "@/lib/period"
import { readPeriod } from "@/lib/period-helpers"
import { PeriodSelector } from "@/components/shared/period-selector"

export const metadata = { title: "Visão da carteira · Delivery OS" }

/** 75 dias vira "2 meses e 15 dias". */
function tempo(dias: number): string {
  if (dias < 30) return `${dias} dia${dias === 1 ? "" : "s"}`
  const m = Math.floor(dias / 30)
  const d = dias - m * 30
  const base = `${m} ${m === 1 ? "mês" : "meses"}`
  return d === 0 ? base : `${base} e ${d}d`
}

export default async function VisaoPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; inicio?: string; fim?: string }>
}) {
  const sp = await searchParams
  await assertCanView("unidades")
  const { range } = readPeriod(sp)
  const v = await visaoDaCarteira(range)
  const periodo = formatRangeLabel(range)

  if (!v) return null

  return (
    <div className="flex flex-1 flex-col gap-4 bg-muted/30 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <LayoutDashboard className="size-6 text-muted-foreground" />
            Visão da carteira
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Como a carteira está hoje, antes de olhar loja por loja.
          </p>
        </div>
        <PeriodSelector current={range} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          rotulo="Lojas ativas"
          valor={`${v.lojasAtivas}/${v.lojasTotal}`}
          nota={
            v.lojasTotal - v.lojasAtivas > 0
              ? `${v.lojasTotal - v.lojasAtivas} inativa(s)`
              : "todas ativas"
          }
        />
        <Kpi rotulo={`Faturamento · ${periodo}`} valor={fmtBRL(v.faturamento)} nota="com canceladas" destaque />
        <Kpi
          rotulo="Média por loja"
          valor={fmtBRL(v.mediaPorLoja)}
          /* Dividido pelas lojas COM DADO, não pelo total: incluir as sem
             importação afundaria a média com zeros que não são vendas. */
          nota={`base: ${v.lojasComDado} com dado`}
        />
        <Kpi
          rotulo="Permanência média"
          valor={v.permanenciaMedia === null ? "—" : tempo(v.permanenciaMedia)}
          nota={
            v.permanenciaMedia === null
              ? "sem data de entrada"
              : "tempo em gestão"
          }
          alerta={v.permanenciaMedia === null}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloco titulo="Metas de 30 dias" icone={<Target className="size-4" />}>
          {v.metasComValor === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma loja com meta definida. A meta é preenchida na aba
              Carteira de cada loja.
            </p>
          ) : (
            <>
              <p className="text-3xl font-semibold tabular-nums">
                {v.metasBatidas}
                <span className="text-lg text-muted-foreground">
                  /{v.metasComValor}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                bateram a meta nos últimos 30 dias
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-emerald-500"
                  style={{
                    width: `${(v.metasBatidas / v.metasComValor) * 100}%`,
                  }}
                />
              </div>
            </>
          )}
        </Bloco>

        <Bloco
          titulo={`Semana de ${new Date(`${v.semanaAtual}T12:00:00Z`).toLocaleDateString("pt-BR")}`}
          icone={<AlertTriangle className="size-4" />}
        >
          <p className="text-3xl font-semibold tabular-nums">
            {fmtNum(v.semanasPendentes)}
          </p>
          <p className="text-xs text-muted-foreground">
            loja(s) ativa(s) sem comentário escrito nesta semana
          </p>
          {v.semanasVencendoHoje > 0 && (
            <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              Hoje é quarta — {v.semanasVencendoHoje} vencem hoje.
            </p>
          )}
        </Bloco>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <TrendingDown className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Precisa de atenção</h2>
          {v.alertas.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
              {v.alertas.length}
            </span>
          )}
        </div>
        {v.alertas.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhuma loja em alerta. Sem queda acima de 15%, sem loja parada.
          </p>
        ) : (
          <ul className="divide-y">
            {v.alertas.map((a) => (
              <li key={`${a.unitId}-${a.motivo}`}>
                <Link
                  href={`/unidades/${encodeURIComponent(a.code)}`}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-muted/50"
                >
                  <span className="text-muted-foreground">#{a.code}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {a.nome}
                  </span>
                  <span className="shrink-0 text-xs text-amber-700 dark:text-amber-400">
                    {a.motivo}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
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
  nota: string
  destaque?: boolean
  alerta?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border bg-card px-4 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {rotulo}
      </span>
      <span className={`tabular-nums font-semibold ${destaque ? "text-xl" : "text-lg"}`}>
        {valor}
      </span>
      <span
        className={`text-[11px] ${alerta ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}
      >
        {nota}
      </span>
    </div>
  )
}

function Bloco({
  titulo,
  icone,
  children,
}: {
  titulo: string
  icone: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        {icone}
        <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
      </div>
      {children}
    </div>
  )
}
