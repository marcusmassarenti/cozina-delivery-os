import { ArrowRight, Check, Circle, Clock } from "lucide-react"
import Link from "next/link"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"

import { contarLojasConectadas } from "@/lib/data/conexoes-contagem"

/**
 * Painel de status das integrações de plataforma (entrada).
 *
 * ⚠️ As contagens de loja vêm do BANCO, não de texto fixo. A versão anterior
 * dizia "4 de 18 vinculadas" na 99 — número escrito à mão que envelheceu e
 * passou meses mentindo (o real eram 7 de 59). Painel de status que mente é
 * pior que painel que não existe: você para de conferir porque acha que já
 * conferiu.
 */
type Status = "conectado" | "homologacao" | "verificacao" | "manual"

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
  verificacao: {
    label: "Em verificação",
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
  /** Onde o usuário sincroniza/importa os dados desta plataforma. */
  sync: { label: string; href: string }
}

type Contagens = {
  ifoodVinculadas: number
  ifoodTotal: number
  noveVinculadas: number
  noveTotal: number
}

const montarPlataformas = (n: Contagens): PlatformStatus[] => [
  {
    id: "ifood",
    name: "iFood",
    status: "conectado",
    headline: "API oficial — conciliação (D-1) + avaliações, todo dia",
    meta: [
      { label: "Dados", value: "Financeiro (conciliação) + Avaliações" },
      { label: "Lojas", value: `${n.ifoodVinculadas} de ${n.ifoodTotal} vinculadas` },
      { label: "Empresa", value: "Lab of Change Ltda" },
    ],
    steps: [
      { label: "App de produção criado", state: "done" },
      { label: "Autenticação implementada", state: "done" },
      { label: "Financeiro + Avaliações via API", state: "done" },
      { label: "Vincular as demais lojas", state: "active" },
    ],
    sync: {
      label: "Gerenciar conexões",
      href: "/integracao/ifood-merchants",
    },
  },
  {
    id: "99food",
    name: "99 Food",
    status: "conectado",
    headline: "API oficial — financeiro + cardápio sincronizando",
    meta: [
      { label: "Dados", value: "Financeiro (repasse) + Cardápio" },
      { label: "Lojas", value: `${n.noveVinculadas} de ${n.noveTotal} vinculadas` },
      { label: "Empresa", value: "Lab of Change Ltda" },
    ],
    steps: [
      { label: "App de produção criado", state: "done" },
      { label: "Lojas vinculadas + autorizadas", state: "done" },
      { label: "Financeiro + Cardápio via API", state: "done" },
      { label: "Vincular as demais lojas", state: "active" },
    ],
    sync: { label: "Sincronize em Importação", href: "/importacao" },
  },
  {
    id: "keeta",
    name: "Keeta",
    status: "manual",
    headline: "Dados pelos relatórios importados (.xlsx / CSV)",
    meta: [{ label: "API", value: "Só operacional — financeiro manual" }],
    sync: { label: "Importe os relatórios", href: "/importacao" },
  },
  {
    id: "cardapioweb",
    name: "Cardápio Web",
    status: "verificacao",
    headline: "Canal próprio do restaurante — pedidos e clientes pela API",
    meta: [
      { label: "Dados", value: "Pedidos + Clientes + Catálogo" },
      { label: "Acesso", value: "OAuth do lojista (PKCE)" },
    ],
    steps: [
      { label: "Homologado em sandbox", state: "done" },
      { label: "App de produção aprovado", state: "done" },
      { label: "Conectar a primeira loja real", state: "active" },
    ],
    sync: { label: "Gerenciar conexões", href: "/integracao/cardapioweb" },
  },
]

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") return <Check className="size-3 text-emerald-600" />
  if (state === "active") return <Clock className="size-3 text-amber-600" />
  return <Circle className="size-3 text-muted-foreground/40" />
}

export async function PlataformasStatus() {
  const n = await contarLojasConectadas()
  return (
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
      {montarPlataformas(n).map((p) => {
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

            {/* Tracker de progresso */}
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

            {/* Onde sincronizar */}
            <Link
              href={p.sync.href}
              className="mt-3 flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              <span>{p.sync.label}</span>
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
            </Link>
          </div>
        )
      })}
    </div>
  )
}
