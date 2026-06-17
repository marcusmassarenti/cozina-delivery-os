"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Download, FileArchive, Play } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { fmtBRL } from "@/lib/format"

import {
  testReconciliation,
  type TestReconciliationState,
} from "../_actions"

const initial: TestReconciliationState = { ok: false }

export function ReconciliationTester() {
  const [state, formAction] = useActionState(testReconciliation, initial)
  const [merchantId, setMerchantId] = React.useState("")
  const [competencia, setCompetencia] = React.useState(currentCompetencia())

  return (
    <div className="rounded-xl border bg-card p-5">
      <form action={formAction} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Merchant ID</Label>
            <Input
              name="merchantId"
              value={merchantId}
              onChange={(e) => setMerchantId(e.target.value)}
              placeholder="UUID da loja no iFood"
              className="font-mono text-xs"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Competência</Label>
            <Input
              name="competencia"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              placeholder="YYYY-MM"
              className="w-28 font-mono text-xs"
              pattern="\d{4}-\d{2}"
              required
            />
          </div>
          <div className="flex items-end">
            <SubmitButton />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          GET{" "}
          <code className="font-mono">
            /financial/v3.0/merchants/{`{merchantId}`}/reconciliation?competencia=YYYY-MM
          </code>{" "}
          → baixa o .gz → descompacta → parseia o CSV (separador <code>;</code>)
          → mostra totais por <code>impacto_no_repasse</code>.
        </p>
      </form>

      {state.linkStatus != null && (
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Metric label="Status HTTP" value={`${state.linkStatus}`} ok={state.ok} />
          <Metric
            label="Duração link"
            value={`${state.durationMs ?? 0} ms`}
            ok={!!state.durationMs && state.durationMs < 8000}
          />
          {state.sizeBytes != null && (
            <Metric
              label="Tamanho .gz"
              value={`${(state.sizeBytes / 1024).toFixed(1)} KB`}
              ok={true}
            />
          )}
          {state.rowCount != null && (
            <Metric
              label="Linhas CSV"
              value={`${state.rowCount}`}
              ok={state.rowCount > 0}
            />
          )}
        </div>
      )}

      {state.metrics && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-xs dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <p className="font-semibold text-emerald-900 dark:text-emerald-300">
            Métricas de homologação
          </p>
          <ul className="mt-1.5 space-y-0.5 text-emerald-800 dark:text-emerald-400/90">
            <li>
              Lançamentos com <strong>impacto_no_repasse = SIM</strong>:{" "}
              <strong>{state.metrics.countSim}</strong>
              {" · "}
              soma do valor líquido:{" "}
              <strong>{fmtBRL(state.metrics.sumSim)}</strong>
            </li>
            <li>
              Lançamentos com <strong>impacto_no_repasse = NÃO</strong> (apenas
              informativos): <strong>{state.metrics.countNao}</strong>
            </li>
          </ul>
        </div>
      )}

      {state.downloadUrl && (
        <a
          href={state.downloadUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-orange-600 hover:underline"
        >
          <Download className="size-3.5" />
          downloadUrl (S3 presigned, expira em 24h)
        </a>
      )}

      {state.error && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          <strong>Erro:</strong> {state.error}
        </div>
      )}

      {state.linkRaw && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            Resposta crua da chamada do link
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted/40 p-3 text-[11px] leading-relaxed">
            {tryFormat(state.linkRaw)}
          </pre>
        </details>
      )}

      {state.sample && state.sample.length > 0 && state.headers && (
        <details className="mt-3" open>
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            <FileArchive className="-mt-0.5 mr-1 inline size-3.5" />
            Amostra do CSV (primeiras {state.sample.length} linhas, {state.headers.length} colunas)
          </summary>
          <div className="mt-2 max-h-96 overflow-auto rounded-md border bg-card">
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 bg-muted/40 text-[9px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  {state.headers.slice(0, 8).map((h) => (
                    <th key={h} className="px-2 py-1.5 text-left font-medium">
                      {h}
                    </th>
                  ))}
                  {state.headers.length > 8 && (
                    <th className="px-2 py-1.5 text-left font-medium text-muted-foreground/60">
                      +{state.headers.length - 8} cols
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {state.sample.map((row, i) => (
                  <tr key={i} className="border-t">
                    {state.headers!.slice(0, 8).map((h) => (
                      <td key={h} className="truncate px-2 py-1 font-mono">
                        {(row[h] ?? "").slice(0, 30)}
                      </td>
                    ))}
                    {state.headers!.length > 8 && (
                      <td className="px-2 py-1 text-muted-foreground/60">…</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}

function Metric({
  label,
  value,
  ok,
}: {
  label: string
  value: string
  ok: boolean
}) {
  return (
    <div
      className={`rounded-md border p-2.5 ${
        ok
          ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20"
          : "border-rose-200 bg-rose-50/40 dark:border-rose-900/40 dark:bg-rose-950/20"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`text-sm font-bold tabular-nums ${
          ok
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-rose-700 dark:text-rose-400"
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="gap-1.5">
      <Play className="size-3.5" />
      {pending ? "Baixando..." : "Disparar"}
    </Button>
  )
}

function currentCompetencia(): string {
  const d = new Date()
  // Pega o mês anterior (D-1 padrão da reconciliation semanal)
  d.setMonth(d.getMonth() - 1)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  return `${yyyy}-${mm}`
}

function tryFormat(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}
