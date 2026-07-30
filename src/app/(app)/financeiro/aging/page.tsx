import { ArrowDownCircle, ArrowUpCircle } from "lucide-react"

import { getAging, type AgingLado, type AgingBucket } from "@/lib/data/aging"
import { getCaixaHoldingId, getCategoriesFlat, type FinCategory } from "@/lib/data/caixa"
import { fmtBRL, fmtBRLShort } from "@/lib/format"

function fmtDate(d: string | null): string {
  if (!d) return "sem venc."
  const [y, m, day] = d.split("-")
  return `${day}/${m}/${y.slice(2)}`
}
function diasAtraso(due: string | null): number | null {
  if (!due) return null
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
  const a = new Date(`${due}T00:00:00-03:00`).getTime()
  const b = new Date(`${today}T00:00:00-03:00`).getTime()
  const d = Math.round((b - a) / 86_400_000)
  return d > 0 ? d : null
}

function AgingBlock({
  titulo,
  lado,
  tone,
  icon: Icon,
  catById,
}: {
  titulo: string
  lado: AgingLado
  tone: "pagar" | "receber"
  icon: React.ComponentType<{ className?: string }>
  catById: Map<string, FinCategory>
}) {
  const cor = tone === "pagar" ? "text-rose-600" : "text-emerald-600"
  const comEntradas = lado.buckets.filter((b) => b.count > 0)
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className={`size-4 ${cor}`} />
          {titulo}
        </h2>
        <div className="text-right">
          <div className={`text-lg font-semibold tabular-nums ${cor}`}>{fmtBRL(lado.total)}</div>
          {lado.vencidoTotal > 0 && (
            <div className="text-[11px] font-medium text-rose-600">
              {fmtBRL(lado.vencidoTotal)} vencido
            </div>
          )}
        </div>
      </div>

      {/* Barra de faixas */}
      <div className="grid grid-cols-5 gap-1.5">
        {lado.buckets.map((b) => (
          <div
            key={b.key}
            className={`rounded-lg border p-2 text-center ${
              b.vencido && b.total > 0
                ? "border-rose-200 bg-rose-50/60 dark:border-rose-900/40 dark:bg-rose-950/20"
                : "bg-muted/30"
            }`}
          >
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
              {b.key === "a_vencer" ? "A vencer" : b.label.replace("Vencido ", "").replace(" dias", "d")}
            </div>
            <div className={`mt-0.5 text-xs font-semibold tabular-nums ${b.vencido && b.total > 0 ? "text-rose-600" : ""}`}>
              {b.total > 0 ? fmtBRLShort(b.total) : "—"}
            </div>
            {b.count > 0 && <div className="text-[9px] text-muted-foreground">{b.count}×</div>}
          </div>
        ))}
      </div>

      {/* Detalhe por faixa */}
      {lado.total === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nada em aberto.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {comEntradas.map((b: AgingBucket) => (
            <div key={b.key}>
              <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wider ${b.vencido ? "text-rose-600" : "text-muted-foreground"}`}>
                {b.label} · {fmtBRL(b.total)}
              </div>
              <div className="divide-y rounded-lg border">
                {b.entries.map((e) => {
                  const cat = e.categoryId ? catById.get(e.categoryId) : null
                  const atraso = diasAtraso(e.dueDate)
                  return (
                    <div key={e.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {e.titular || e.description || cat?.name || "Lançamento"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {cat?.name ? `${cat.name} · ` : ""}
                          vence {fmtDate(e.dueDate)}
                          {atraso ? ` · há ${atraso} dias` : ""}
                        </div>
                      </div>
                      <span className={`shrink-0 text-sm font-semibold tabular-nums ${cor}`}>
                        {fmtBRL(e.value)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default async function AgingPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string }>
}) {
  const { loja } = await searchParams
  const holdingId = await getCaixaHoldingId()
  if (!holdingId) return null
  const [aging, categories] = await Promise.all([
    getAging(loja),
    getCategoriesFlat(holdingId),
  ])
  if (!aging) return null
  const catById = new Map(categories.map((c) => [c.id, c]))

  const saldoAberto = aging.receber.total - aging.pagar.total

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Contas a pagar & a receber</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Tudo que está em aberto, por faixa de vencimento (aging).
        </p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <div className="text-[11px] font-medium text-muted-foreground">A receber</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-600">{fmtBRL(aging.receber.total)}</div>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <div className="text-[11px] font-medium text-muted-foreground">A pagar</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums text-rose-600">{fmtBRL(aging.pagar.total)}</div>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <div className="text-[11px] font-medium text-muted-foreground">Saldo em aberto</div>
          <div className={`mt-0.5 text-lg font-semibold tabular-nums ${saldoAberto < 0 ? "text-rose-600" : "text-emerald-600"}`}>
            {fmtBRL(saldoAberto)}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AgingBlock titulo="A pagar" lado={aging.pagar} tone="pagar" icon={ArrowUpCircle} catById={catById} />
        <AgingBlock titulo="A receber" lado={aging.receber} tone="receber" icon={ArrowDownCircle} catById={catById} />
      </div>
    </div>
  )
}
