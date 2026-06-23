"use client"

import * as React from "react"
import { Check, CheckCircle2, FileWarning, RefreshCw, XCircle } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PlatformLogo } from "@/components/platform-logo"

/** Espelha o retorno de /api/integracao/ifood-sync-run (syncIfoodAll). */
type ReconLine = {
  competencia: string
  ok?: boolean
  status?: number
  rowCount?: number
  persisted?: number
  substituido?: boolean
  skipped?: string
  error?: string
}
type UnitResult = {
  unitCode: string
  unitName?: string
  merchantId: string
  reconciliation?: ReconLine[]
}
type SyncRunResult = {
  ok: boolean
  unitsProcessed?: number
  results?: UnitResult[]
  error?: string
}

/** Categoria derivada do resultado de cada loja. */
type Bucket = "online" | "manual" | "erro"

type StoreVerdict = {
  code: string
  name: string
  bucket: Bucket
  persisted: number
  months: string[]
  detail: string
}

/** Decide se a loja puxou online, é só manual (sem arquivo) ou deu erro. */
function classify(u: UnitResult): StoreVerdict {
  const recon = u.reconciliation ?? []
  const persisted = recon.reduce((s, r) => s + (r.persisted ?? 0), 0)
  const okMonths = recon
    .filter((r) => r.ok && (r.rowCount ?? 0) > 0)
    .map((r) => r.competencia)
  const errs = recon.filter((r) => r.error)
  // "No reconciliation file" / 404 = o iFood não gera o arquivo de conciliação
  // externa pra esse merchant → segue por importação manual.
  const semArquivo =
    errs.length > 0 &&
    errs.every(
      (r) =>
        r.status === 404 ||
        (r.error ?? "").toLowerCase().includes("no reconciliation file") ||
        (r.error ?? "").includes("404"),
    )

  const name = u.unitName ?? u.unitCode

  if (persisted > 0) {
    return {
      code: u.unitCode,
      name,
      bucket: "online",
      persisted,
      months: okMonths,
      detail: `${persisted.toLocaleString("pt-BR")} lançamentos · ${okMonths.join(", ")}`,
    }
  }
  if (semArquivo) {
    return {
      code: u.unitCode,
      name,
      bucket: "manual",
      persisted: 0,
      months: [],
      detail: "iFood não gera conciliação via API — segue por planilha",
    }
  }
  // Erro real (rede, parse, etc.) ou nada gravado.
  const firstErr = errs[0]?.error
  return {
    code: u.unitCode,
    name,
    bucket: "erro",
    persisted: 0,
    months: [],
    detail: firstErr ?? "Sem dados gravados",
  }
}

export function SyncIfoodButton() {
  const [pending, setPending] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [result, setResult] = React.useState<SyncRunResult | null>(null)

  async function run() {
    setPending(true)
    setResult(null)
    try {
      const r = await fetch("/api/integracao/ifood-sync-run", { method: "POST" })
      const j = (await r.json()) as SyncRunResult
      setResult(j)
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) })
    } finally {
      setPending(false)
      setOpen(true)
    }
  }

  const verdicts = (result?.results ?? []).map(classify)
  const online = verdicts.filter((v) => v.bucket === "online")
  const manual = verdicts.filter((v) => v.bucket === "manual")
  const erro = verdicts.filter((v) => v.bucket === "erro")
  const done = !!result?.ok && !result?.error && !open

  return (
    <>
      {/* Pill no mesmo estilo do "Sincronizar 99" pra os dois ficarem juntos. */}
      <button
        type="button"
        disabled={pending}
        onClick={run}
        title="Sincronizar conciliação financeira do iFood agora"
        className="inline-flex items-center gap-1 rounded-full border border-current/25 px-2 py-0.5 text-[11px] font-medium opacity-70 transition hover:opacity-100 disabled:opacity-50"
      >
        {pending ? (
          <RefreshCw className="size-3 animate-spin" />
        ) : done ? (
          <Check className="size-3" />
        ) : (
          <RefreshCw className="size-3" />
        )}
        {pending
          ? "Sincronizando iFood…"
          : done
            ? "iFood sincronizado"
            : "Sincronizar iFood"}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlatformLogo platform="ifood" className="size-5" />
              Sincronização iFood
            </DialogTitle>
            <DialogDescription>
              {result?.error
                ? "A sincronização falhou."
                : `Conciliação financeira de ${result?.unitsProcessed ?? 0} loja(s) — mês atual e anterior.`}
            </DialogDescription>
          </DialogHeader>

          {result?.error ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
              {result.error}
            </div>
          ) : (
            <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
              <Group
                tone="emerald"
                icon={<CheckCircle2 className="size-4" />}
                title="Puxaram da API"
                empty="Nenhuma loja atualizada agora"
                items={online}
              />
              <Group
                tone="amber"
                icon={<FileWarning className="size-4" />}
                title="Só manual (sem conciliação na API)"
                empty="Nenhuma"
                items={manual}
              />
              {erro.length > 0 && (
                <Group
                  tone="rose"
                  icon={<XCircle className="size-4" />}
                  title="Com erro"
                  empty=""
                  items={erro}
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function Group({
  tone,
  icon,
  title,
  empty,
  items,
}: {
  tone: "emerald" | "amber" | "rose"
  icon: React.ReactNode
  title: string
  empty: string
  items: StoreVerdict[]
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-700 dark:text-amber-400"
        : "text-rose-700 dark:text-rose-400"

  return (
    <div>
      <div className={`flex items-center gap-1.5 text-xs font-semibold ${toneCls}`}>
        {icon}
        {title}
        <span className="text-muted-foreground">({items.length})</span>
      </div>
      {items.length === 0 ? (
        empty ? (
          <p className="mt-1 pl-5 text-xs text-muted-foreground">{empty}</p>
        ) : null
      ) : (
        <ul className="mt-1.5 space-y-1">
          {items.map((v) => (
            <li
              key={v.code}
              className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-1.5"
            >
              <span className="truncate text-sm font-medium">
                <span className="text-muted-foreground tabular-nums">
                  {v.code}
                </span>{" "}
                {v.name}
              </span>
              <span className="shrink-0 text-right text-[11px] text-muted-foreground">
                {v.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
