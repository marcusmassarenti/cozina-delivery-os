import Link from "next/link"
import { notFound } from "next/navigation"
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Gift,
  Plug,
  Sparkles,
  TrendingUp,
  UserMinus,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react"

import { getCurrentHoldingId, isSuperadmin } from "@/lib/auth/permissions"
import { getClientsOverview } from "@/lib/data/plataforma"
import { getDefaultPlan } from "@/lib/data/assinatura"
import { getPacoteConfig } from "@/lib/data/ia-chat"
import { daysUntil } from "@/lib/data/billing"
import { fmtBRL, fmtNum } from "@/lib/format"

import { NfSetupButton } from "./_components/nf-setup-button"
import { NovoClienteDialog } from "./_components/novo-cliente-dialog"
import { PlanSettingsDialog } from "./_components/plan-settings-dialog"
import { ClientsTable } from "./_components/clients-table"

export default async function PlataformaPage() {
  if (!(await isSuperadmin())) notFound()
  const { clients, totals } = await getClientsOverview()
  const myHoldingId = await getCurrentHoldingId()
  const defaultPlan = await getDefaultPlan()
  const pacote = await getPacoteConfig()

  const nowMs = Date.now()
  const now = new Date(nowMs)
  const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  const emAtraso = clients.filter(
    (c) => c.billingStatus === "overdue" || c.billingStatus === "suspended",
  ).length
  const assinaturasAsaas = clients.filter((c) => c.asaasActive).length

  // ── KPIs de SaaS ──────────────────────────────────────────────────
  const pagantes = clients.filter((c) => c.billingStatus === "paid").length
  const novosNoMes = clients.filter((c) =>
    (c.createdAt ?? "").slice(0, 7) === mesAtual,
  ).length
  const trialsVencendo = clients.filter(
    (c) =>
      c.billingStatus === "trial" &&
      c.trialEndsAt &&
      daysUntil(c.trialEndsAt) >= 0 &&
      daysUntil(c.trialEndsAt) <= 7,
  ).length
  const canceladosNoMes = clients.filter(
    (c) =>
      c.asaasLastEvent === "SUBSCRIPTION_CANCELED" &&
      (c.asaasLastEventAt ?? "").slice(0, 7) === mesAtual,
  ).length
  const arpa = pagantes > 0 ? totals.mrr / pagantes : 0

  const kpisFin = [
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
  const kpisSaas = [
    {
      label: "Novos no mês",
      value: fmtNum(novosNoMes),
      icon: UserPlus,
      sub: `${pagantes} pagante${pagantes !== 1 ? "s" : ""} no total`,
    },
    {
      label: "Trials vencendo (7d)",
      value: fmtNum(trialsVencendo),
      icon: Gift,
      sub: "fila de conversão",
      alert: trialsVencendo > 0,
    },
    {
      label: "Cancelados no mês",
      value: fmtNum(canceladosNoMes),
      icon: UserMinus,
      sub: "churn",
      alert: canceladosNoMes > 0,
    },
    {
      label: "Receita média / cliente",
      value: fmtBRL(arpa),
      icon: Users,
      sub: "ARPA",
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
              <>
                {" "}
                · {fmtNum(assinaturasAsaas)} assinatura
                {assinaturasAsaas !== 1 ? "s" : ""} Asaas
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/plataforma/conexoes"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Plug className="size-4" />
            Conexões
          </Link>
          <Link
            href="/plataforma/consumo-ia"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Sparkles className="size-4" />
            Consumo IA
          </Link>
          <Link
            href="/plataforma/analytics"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <TrendingUp className="size-4" />
            Analytics
          </Link>
          <PlanSettingsDialog precos={defaultPlan} pacotePreco={pacote.preco} />
          <NovoClienteDialog />
        </div>
      </div>

      {/* KPIs financeiros */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpisFin.map((k) => (
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
            {k.sub && (
              <div className="text-[11px] text-muted-foreground">{k.sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* KPIs de SaaS (saúde da base) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpisSaas.map((k) => (
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
            {k.sub && (
              <div className="text-[11px] text-muted-foreground">{k.sub}</div>
            )}
          </div>
        ))}
      </div>

      <ClientsTable clients={clients} myHoldingId={myHoldingId} nowMs={nowMs} />

      <NfSetupButton />

      <p className="text-xs text-muted-foreground">
        Quando um cliente está <strong>sem pagar</strong> e passa da{" "}
        <strong>data de suspensão</strong>, o acesso dele é bloqueado
        automaticamente até regularizar.
      </p>
    </div>
  )
}
