import { Check, Circle, Clock } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"

/**
 * Painel de status das integrações de plataforma (entrada).
 * Reflete o estado REAL de cada conexão — não é mockup:
 *  - iFood: app criado + auth pronta, em homologação (ticket aberto).
 *  - 99 Food / Keeta: importação manual de relatórios.
 * Quando o iFood liberar produção, o badge vira "Conectado" e entra a
 * última sincronização.
 */
type Status = "conectado" | "homologacao" | "manual"

const STATUS_STYLE: Record<
  Status,
  { label: string; dot: string; badge: string }
> = {
  conectado: {
    label: "Conectado",
    dot: "bg-emerald-500",
    badge:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
  },
  homologacao: {
    label: "Em homologação",
    dot: "bg-amber-500",
    badge:
      "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
  },
  manual: {
    label: "Importação manual",
    dot: "bg-slate-400",
    badge: "bg-muted text-muted-foreground",
  },
}

type StepState = "done" | "active" | "pending"
type Step = { label: string; state: StepState }

type PlatformStatus = {
  id: PlatformId
  name: string
  status: Status
  headline: string
  meta: { label: string; value: string }[]
  steps?: Step[]
}

const PLATFORMS: PlatformStatus[] = [
  {
    id: "ifood",
    name: "iFood",
    status: "homologacao",
    headline: "Conciliação On Demand (D-1) pela API oficial",
    meta: [
      { label: "App", value: "Cozina Delivery OS · centralizado" },
      { label: "Módulos", value: "Financeiro · Merchant" },
      { label: "Ticket", value: "#28413618 · em análise" },
    ],
    steps: [
      { label: "App criado", state: "done" },
      { label: "Autenticação implementada", state: "done" },
      { label: "Homologação iFood", state: "active" },
      { label: "Produção (todas as lojas)", state: "pending" },
    ],
  },
  {
    id: "99food",
    name: "99 Food",
    status: "manual",
    headline: "Dados pelos relatórios importados (.xlsx / CSV)",
    meta: [{ label: "API", value: "Financeira existe — fase futura" }],
  },
  {
    id: "keeta",
    name: "Keeta",
    status: "manual",
    headline: "Dados pelos relatórios importados (.xlsx / CSV)",
    meta: [{ label: "API", value: "Só operacional — financeiro manual" }],
  },
]

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") return <Check className="size-3 text-emerald-600" />
  if (state === "active") return <Clock className="size-3 text-amber-600" />
  return <Circle className="size-3 text-muted-foreground/40" />
}

export function PlataformasStatus() {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {PLATFORMS.map((p) => {
        const st = STATUS_STYLE[p.status]
        return (
          <div
            key={p.id}
            className="flex flex-col rounded-xl border bg-card p-4 shadow-sm"
          >
            {/* Cabeçalho: logo + nome + badge */}
            <div className="flex items-center gap-3">
              <PlatformLogo platform={p.id} size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{p.name}</p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {p.headline}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-1.5">
              <span className={`size-1.5 rounded-full ${st.dot}`} />
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${st.badge}`}
              >
                {st.label}
              </span>
            </div>

            {/* Metadados */}
            <dl className="mt-3 space-y-1 border-t pt-3">
              {p.meta.map((m) => (
                <div key={m.label} className="flex gap-2 text-[11px]">
                  <dt className="shrink-0 font-semibold text-muted-foreground">
                    {m.label}
                  </dt>
                  <dd className="min-w-0 text-right text-foreground/90 ml-auto">
                    {m.value}
                  </dd>
                </div>
              ))}
            </dl>

            {/* Tracker de progresso (só iFood por ora) */}
            {p.steps && (
              <ol className="mt-3 space-y-1.5 border-t pt-3">
                {p.steps.map((s) => (
                  <li
                    key={s.label}
                    className="flex items-center gap-2 text-[11px]"
                  >
                    <StepIcon state={s.state} />
                    <span
                      className={
                        s.state === "pending"
                          ? "text-muted-foreground/60"
                          : s.state === "active"
                            ? "font-medium text-foreground"
                            : "text-muted-foreground line-through decoration-muted-foreground/30"
                      }
                    >
                      {s.label}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )
      })}
    </div>
  )
}
