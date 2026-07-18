import { notFound } from "next/navigation"
import { AlertTriangle, Building2, CheckCircle2, Clock, Wallet } from "lucide-react"

import { getCurrentHoldingId, isSuperadmin } from "@/lib/auth/permissions"
import { getClientsOverview } from "@/lib/data/plataforma"
import { getDefaultPlan } from "@/lib/data/assinatura"
import { getPacoteConfig } from "@/lib/data/ia-chat"
import { daysUntil } from "@/lib/data/billing"
import type { BillingStatus } from "@/lib/data/billing"
import { fmtBRL, fmtNum } from "@/lib/format"

import { NfSetupButton } from "./_components/nf-setup-button"
import { NovoClienteDialog } from "./_components/novo-cliente-dialog"
import { PlanSettingsDialog } from "./_components/plan-settings-dialog"
import { EditBillingDialog } from "./_components/edit-billing-dialog"
import { UnitsDialog } from "./_components/units-dialog"
import { PaymentsDialog } from "./_components/payments-dialog"
import { DeleteClientButton } from "./_components/delete-client-button"

const STATUS: Record<BillingStatus, { label: string; cls: string }> = {
  trial: {
    label: "Teste grátis",
    cls: "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-400",
  },
  paid: {
    label: "Pago",
    cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
  },
  pending: {
    label: "Pendente",
    cls: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-400",
  },
  overdue: {
    label: "Em atraso",
    cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
  },
  suspended: {
    label: "Suspenso",
    cls: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400",
  },
  none: { label: "Sem cobrança", cls: "bg-muted text-muted-foreground" },
}

function fmtDate(d: string | null): string {
  if (!d) return "—"
  const [y, m, day] = d.split("-")
  return `${day}/${m}/${y}`
}

/** "vence em X dias" / "vence hoje" / "venceu" pro teste grátis. */
function trialLabel(iso: string | null): string {
  if (!iso) return ""
  const d = daysUntil(iso)
  if (d < 0) return "venceu"
  if (d === 0) return "vence hoje"
  return `vence em ${d} dia${d === 1 ? "" : "s"}`
}

/** Nome amigável do último evento de webhook do Asaas. */
function asaasEventLabel(event: string): string {
  const map: Record<string, string> = {
    PAYMENT_CONFIRMED: "Pagamento confirmado",
    PAYMENT_RECEIVED: "Pagamento recebido",
    PAYMENT_RECEIVED_IN_CASH: "Pago em dinheiro",
    SIMULATED_PAYMENT_CONFIRMED: "Pago (teste)",
    PAYMENT_OVERDUE: "Cobrança vencida",
    PAYMENT_REFUNDED: "Estornado",
    SUBSCRIPTION_CANCELED: "Assinatura cancelada",
  }
  return map[event] ?? event
}

/** Último acesso: "DD/MM/AA HH:mm" (SP) ou "nunca". */
function fmtLastLogin(iso: string | null): string {
  if (!iso) return "nunca"
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default async function PlataformaPage() {
  if (!(await isSuperadmin())) notFound()
  const { clients, totals } = await getClientsOverview()
  const myHoldingId = await getCurrentHoldingId()
  const defaultPlan = await getDefaultPlan()
  const pacote = await getPacoteConfig()

  const emAtraso = clients.filter(
    (c) => c.billingStatus === "overdue" || c.billingStatus === "suspended",
  ).length
  const assinaturasAsaas = clients.filter((c) => c.asaasActive).length

  const kpis = [
    { label: "Receita mensal (MRR)", value: fmtBRL(totals.mrr), icon: Wallet },
    { label: "Recebido", value: fmtBRL(totals.received), icon: CheckCircle2 },
    { label: "A receber", value: fmtBRL(totals.pending), icon: Clock },
    {
      label: "Em atraso",
      value: fmtBRL(totals.overdueAmount),
      sub: `${emAtraso} cliente${emAtraso !== 1 ? "s" : ""}`,
      icon: AlertTriangle,
      alert: totals.overdueAmount > 0 || emAtraso > 0,
    },
  ]

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Building2 className="size-6 text-muted-foreground" />
            Clientes da plataforma
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Visão de dono · {fmtNum(totals.clients)} cliente
            {totals.clients !== 1 ? "s" : ""} · {fmtNum(totals.units)} lojas ·{" "}
            {fmtNum(totals.users)} usuários
            {assinaturasAsaas > 0 && (
              <> · {fmtNum(assinaturasAsaas)} assinatura{assinaturasAsaas !== 1 ? "s" : ""} Asaas</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PlanSettingsDialog precos={defaultPlan} pacotePreco={pacote.preco} />
          <NovoClienteDialog />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <k.icon className={`size-4 ${k.alert ? "text-amber-500" : ""}`} />
              {k.label}
            </div>
            <div
              className={`mt-1 text-2xl font-semibold tabular-nums ${
                k.alert ? "text-amber-600 dark:text-amber-400" : ""
              }`}
            >
              {k.value}
            </div>
            {k.sub && <div className="text-[11px] text-muted-foreground">{k.sub}</div>}
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Cliente</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Pagamento</th>
                <th className="px-4 py-2.5 font-semibold">Vencimento</th>
                <th className="px-4 py-2.5 text-right font-semibold">Lojas</th>
                <th className="px-4 py-2.5 font-semibold">Último acesso</th>
                <th className="px-4 py-2.5 text-right font-semibold">Ação</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const st = STATUS[c.billingStatus]
                return (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {c.establishmentType ?? "Tipo não definido"} ·{" "}
                        {c.users} usuário{c.users !== 1 ? "s" : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${st.cls}`}
                      >
                        {st.label}
                      </span>
                      {c.billingStatus === "trial" && c.trialEndsAt && (
                        <div className="mt-1 text-[11px] font-medium text-violet-700 dark:text-violet-400">
                          {trialLabel(c.trialEndsAt)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{c.paymentMethod ?? "—"}</span>
                        {c.planTier && (
                          <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                            {c.planTier}
                          </span>
                        )}
                        {c.asaasActive && (
                          <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                            Asaas ✓
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {c.computedMonthly > 0 ? `${fmtBRL(c.computedMonthly)}/mês` : "—"}
                        {c.extraUnits > 0 && c.pricePerUnit
                          ? ` · base + ${c.extraUnits}×${fmtBRL(c.pricePerUnit)}`
                          : ""}
                      </div>
                      {c.asaasLastEvent && (
                        <div className="text-[10px] text-muted-foreground">
                          {asaasEventLabel(c.asaasLastEvent)}
                          {c.asaasLastEventAt
                            ? ` · ${fmtLastLogin(c.asaasLastEventAt)}`
                            : ""}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{fmtDate(c.dueDate)}</td>
                    <td className="px-4 py-3 text-right">
                      <UnitsDialog name={c.name} units={c.unitsList} />
                      <div className="text-[11px] text-muted-foreground">
                        {c.activeUnits} ativa{c.activeUnits !== 1 ? "s" : ""}
                        {c.units !== c.activeUnits ? ` de ${c.units}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">
                      {fmtLastLogin(c.lastLogin)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <PaymentsDialog
                          client={{
                            id: c.id,
                            name: c.name,
                            payments: c.payments,
                            suggested: c.computedMonthly,
                            method: c.paymentMethod,
                          }}
                        />
                        <EditBillingDialog
                          client={{
                            id: c.id,
                            name: c.name,
                            establishmentType: c.establishmentType,
                            paymentMethod: c.paymentMethod,
                            monthlyFee: c.monthlyFee,
                            pricePerUnit: c.pricePerUnit,
                            includedUnits: c.includedUnits,
                            billableUnits: c.billableUnits,
                            dueDate: c.dueDate,
                            paid: c.paid,
                            suspendOn: c.suspendOn,
                          }}
                        />
                        <DeleteClientButton
                          id={c.id}
                          name={c.name}
                          canDelete={c.id !== myHoldingId}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Nenhum cliente ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <NfSetupButton />

      <p className="text-xs text-muted-foreground">
        Quando um cliente está <strong>sem pagar</strong> e passa da{" "}
        <strong>data de suspensão</strong>, o acesso dele é bloqueado
        automaticamente até regularizar.
      </p>
    </div>
  )
}
