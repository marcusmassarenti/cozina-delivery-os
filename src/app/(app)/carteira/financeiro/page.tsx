import { PiggyBank } from "lucide-react"

import { assertCanView, getCurrentHoldingId } from "@/lib/auth/permissions"
import { financeiroDaAgencia } from "@/lib/data/carteira-financeiro"
import { createAdminClient } from "@/lib/supabase/admin"
import { fmtBRL } from "@/lib/format"
import { formatRangeLabel } from "@/lib/period"
import { readPeriod } from "@/lib/period-helpers"
import { PeriodSelector } from "@/components/shared/period-selector"

import { FinanceiroView, type LojaSimples } from "./_components/financeiro-view"

export const metadata = { title: "Financeiro da agência · Delivery OS" }

/**
 * T8 — o P&L da AGÊNCIA.
 *
 * ⚠️ Não é o Financeiro que já existe no menu. Aquele responde "quanto sobrou
 * pra LOJA depois das taxas da plataforma"; este, "quanto sobrou pra AGÊNCIA
 * depois das despesas dela".
 */
export default async function FinanceiroAgenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; inicio?: string; fim?: string }>
}) {
  await assertCanView("unidades")
  const sp = await searchParams
  const { range } = readPeriod(sp)
  const [f, lojas] = await Promise.all([
    financeiroDaAgencia(range),
    listarLojas(),
  ])

  return (
    <div className="flex flex-1 flex-col gap-4 bg-muted/30 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <PiggyBank className="size-6 text-muted-foreground" />
            Financeiro da agência
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            O que a agência recebe e o que ela gasta — não é o financeiro das
            lojas.
          </p>
        </div>
        <PeriodSelector current={range} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          rotulo="Projetado mensal"
          valor={fmtBRL(f.projetadoMensal)}
          nota={
            f.lojasSemMensalidade > 0
              ? `${f.lojasSemMensalidade} loja(s) sem mensalidade`
              : `${f.lojasComMensalidade} loja(s) ativas`
          }
          alerta={f.lojasSemMensalidade > 0}
          destaque
        />
        <Kpi
          rotulo="Projetado semanal"
          valor={fmtBRL(f.projetadoSemanal)}
          nota="mensal ÷ 4,33"
        />
        <Kpi
          rotulo={`Recebido · ${formatRangeLabel(range)}`}
          valor={fmtBRL(f.recebido)}
          nota={`${fmtBRL(f.aberto)} em aberto`}
        />
        <Kpi
          rotulo="Atrasado"
          valor={fmtBRL(f.atrasado)}
          nota={f.atrasado > 0 ? "venceu e não entrou" : "nada vencido"}
          alerta={f.atrasado > 0}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi rotulo="Despesas pagas" valor={fmtBRL(f.despesasPagas)} />
        <Kpi rotulo="Despesas em aberto" valor={fmtBRL(f.despesasAbertas)} />
        {/* Sobra usa só dinheiro que se MOVEU — recebido menos pago. Usar o
            previsto daria uma sobra que existe na planilha e não na conta. */}
        <div
          className={`flex flex-col gap-0.5 rounded-xl border px-4 py-3 ${
            f.sobra >= 0
              ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20"
              : "border-rose-300 bg-rose-50/50 dark:border-rose-900 dark:bg-rose-950/20"
          }`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Sobra do período
          </span>
          <span className="text-xl font-semibold tabular-nums">
            {fmtBRL(f.sobra)}
          </span>
          <span className="text-[11px] text-muted-foreground">
            recebido − despesas pagas
          </span>
        </div>
      </div>

      {f.porCategoria.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Despesas por categoria</h2>
          <div className="flex flex-col gap-1.5">
            {f.porCategoria.map((c) => (
              <div key={c.categoria} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-xs">
                  {c.categoria}
                </span>
                <div className="h-3.5 flex-1 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full rounded bg-primary/70"
                    style={{
                      width: `${(c.valor / f.porCategoria[0].valor) * 100}%`,
                    }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-xs font-medium tabular-nums">
                  {fmtBRL(c.valor)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <FinanceiroView
        cobrancas={f.cobrancas}
        despesas={f.despesas}
        lojas={lojas}
      />
    </div>
  )
}

async function listarLojas(): Promise<LojaSimples[]> {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return []
  const { data } = await createAdminClient()
    .from("units")
    .select("id, code, name, brands!inner(holding_id)")
    .eq("brands.holding_id", holdingId)
    .order("code")
  return ((data ?? []) as unknown as LojaSimples[]).map((u) => ({
    id: u.id,
    code: u.code,
    name: u.name,
  }))
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
