import Link from "next/link"
import { ArrowLeft, ExternalLink, Shield } from "lucide-react"

import { createAdminClient } from "@/lib/supabase/admin"

import { AnticipationsTester } from "./_components/anticipations-tester"
import { EventsTester } from "./_components/events-tester"
import { MerchantsTester } from "./_components/merchants-tester"
import { ReconciliationTester } from "./_components/reconciliation-tester"
import { SalesTester } from "./_components/sales-tester"
import { SettlementsTester } from "./_components/settlements-tester"

type LogRow = {
  id: string
  endpoint: string
  method: string
  response_status: number | null
  duration_ms: number | null
  retry_count: number
  homologation_header: boolean
  error_message: string | null
  created_at: string
}

async function getRecentLogs(): Promise<LogRow[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("ifood_api_logs")
    .select(
      "id, endpoint, method, response_status, duration_ms, retry_count, homologation_header, error_message, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50)
  return (data ?? []) as LogRow[]
}

export default async function IfoodHomologPage() {
  const logs = await getRecentLogs()
  const homologEnabled = process.env.IFOOD_HOMOLOGATION === "true"
  const clientIdSet =
    !!process.env.IFOOD_CLIENT_ID && !!process.env.IFOOD_CLIENT_SECRET

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <Link
        href="/integracao"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Voltar para integrações
      </Link>

      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Shield className="size-6 text-orange-500" />
            Homologação iFood (Merchant API)
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Console interno pra disparar chamadas contra a Merchant API,
            ver resposta crua e auditar logs. Usado na reunião de homologação.
          </p>
        </div>
        <Link
          href="/integracao/ifood-merchants"
          className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted/50"
        >
          Vincular merchants ↔ unidades →
        </Link>
      </div>

      {/* Status das envs */}
      <div className="grid gap-3 md:grid-cols-3">
        <StatusCard
          ok={clientIdSet}
          label="Credenciais (IFOOD_CLIENT_ID/SECRET)"
          detail={
            clientIdSet
              ? "Setadas — token será obtido via OAuth"
              : "Faltam env vars no .env.local / Vercel"
          }
        />
        <StatusCard
          ok={homologEnabled}
          label="Header x-request-homologation"
          detail={
            homologEnabled
              ? "Habilitado (sandbox)"
              : "Desabilitado (produção). Setar IFOOD_HOMOLOGATION=true em sandbox"
          }
        />
        <StatusCard
          ok={true}
          label="Auditoria"
          detail={`Tabela ifood_api_logs — ${logs.length} registros recentes`}
        />
      </div>

      {/* Testers (Onda 1: Sales) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          1) Sales — GET /order/v1.0/orders/{`{id}`}
        </h2>
        <SalesTester />
      </section>

      {/* Testers (Onda 2: Reconciliation) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          2) Reconciliation — GET /financial/v3.0/merchants/{`{id}`}/reconciliation
        </h2>
        <ReconciliationTester />
      </section>

      {/* Testers (Onda 2: Financial Events) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          3) Financial Events — GET /financial/v3.0/merchants/{`{id}`}/financial-events
        </h2>
        <EventsTester />
      </section>

      {/* Testers (Onda 3: Merchant listing) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          4) Merchant listing — GET /merchant/v1.0/merchants
        </h2>
        <MerchantsTester />
      </section>

      {/* Testers (Onda 3: Settlements) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          5) Settlements — GET /financial/v3.0/merchants/{`{id}`}/settlements
        </h2>
        <SettlementsTester />
      </section>

      {/* Testers (Onda 3: Anticipations) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          6) Anticipations — GET /financial/v3.0/merchants/{`{id}`}/anticipations
        </h2>
        <AnticipationsTester />
      </section>

      {/* Logs */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Auditoria · últimas chamadas (50)
        </h2>
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Quando</th>
                <th className="px-3 py-2 text-left font-medium">Endpoint</th>
                <th className="px-3 py-2 text-center font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">ms</th>
                <th className="px-3 py-2 text-center font-medium">Retries</th>
                <th className="px-3 py-2 text-center font-medium">Homolog</th>
                <th className="px-3 py-2 text-left font-medium">Erro</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    Nenhuma chamada registrada ainda — dispare o tester acima.
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {new Date(l.created_at).toLocaleTimeString("pt-BR")}
                    </td>
                    <td className="px-3 py-2 font-mono">{l.endpoint}</td>
                    <td className="px-3 py-2 text-center">
                      <StatusBadge status={l.response_status} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {l.duration_ms ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums">
                      {l.retry_count}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {l.homologation_header ? "✓" : "—"}
                    </td>
                    <td className="px-3 py-2 truncate text-rose-600">
                      {l.error_message ?? ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-[10px] text-muted-foreground">
        Documentação:{" "}
        <a
          href="https://developer.ifood.com.br/pt-BR/docs/references/financial/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 underline hover:no-underline"
        >
          Financial API <ExternalLink className="size-2.5" />
        </a>{" "}
        ·{" "}
        <a
          href="https://developer.ifood.com.br/pt-BR/docs/references/order/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 underline hover:no-underline"
        >
          Order/Sales API <ExternalLink className="size-2.5" />
        </a>
      </p>
    </div>
  )
}

function StatusCard({
  ok,
  label,
  detail,
}: {
  ok: boolean
  label: string
  detail: string
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        ok
          ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20"
          : "border-rose-200 bg-rose-50/40 dark:border-rose-900/40 dark:bg-rose-950/20"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-0.5 text-sm font-bold ${
          ok
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-rose-700 dark:text-rose-400"
        }`}
      >
        {ok ? "OK" : "Pendente"}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: number | null }) {
  if (status == null) return <span className="text-muted-foreground">—</span>
  const ok = status >= 200 && status < 300
  const cls = ok
    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
    : status === 0
      ? "bg-muted text-muted-foreground"
      : "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400"
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${cls}`}
    >
      {status || "ERR"}
    </span>
  )
}
