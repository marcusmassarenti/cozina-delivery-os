import { AlertCircle, Check, ClipboardCheck } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import {
  getImportChecklistForMonth,
  type ReportStatus,
} from "@/lib/data/import-checklist"
import { formatPeriodLabel } from "@/lib/period"

const PLAT_LABEL: Record<PlatformId, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
}

function isComplete(r: ReportStatus): boolean {
  return r.perStore ? r.missingCodes.length === 0 && r.unitsWithData > 0 : r.imported
}

/**
 * Checklist do mês: pro time saber, de relance, o que ainda falta subir.
 * Usa o mês corrente. Os relatórios "por loja" (iFood Conciliação e Pedidos)
 * mostram quais lojas faltam; os de rede mostram importado/falta.
 */
export async function ImportChecklist() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const data = await getImportChecklistForMonth(year, month)

  const completos = data.reports.filter(isComplete).length
  const platforms: PlatformId[] = ["ifood", "99food", "keeta"]

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center gap-2.5 border-b px-5 py-3">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
          <ClipboardCheck className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            Checklist do mês · {formatPeriodLabel({ year, month })}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {completos} de {data.reports.length} relatórios completos ·{" "}
            {data.totalUnits} lojas ativas
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            completos === data.reports.length
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
              : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
          }`}
        >
          {completos}/{data.reports.length}
        </span>
      </div>

      <div className="grid gap-4 p-4 md:grid-cols-3">
        {platforms.map((p) => (
          <div key={p}>
            <div className="mb-2 flex items-center gap-2">
              <PlatformLogo platform={p} size="sm" />
              <span className="text-xs font-semibold">{PLAT_LABEL[p]}</span>
            </div>
            <div className="space-y-1.5">
              {data.reports
                .filter((r) => r.platform === p)
                .map((r) => (
                  <ReportRow key={r.key} r={r} />
                ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t bg-muted/30 px-5 py-2.5">
        <p className="text-[11px] text-muted-foreground">
          <strong className="text-foreground">Por loja:</strong> iFood
          Conciliação e Pedidos precisam de 1 arquivo por loja. Os demais são 1
          arquivo da rede (marca todas as lojas no export).
        </p>
      </div>
    </div>
  )
}

function ReportRow({ r }: { r: ReportStatus }) {
  const complete = isComplete(r)
  const toneText = complete
    ? "text-emerald-700 dark:text-emerald-400"
    : "text-amber-700 dark:text-amber-400"
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <div className="flex items-center gap-2">
        {complete ? (
          <Check className="size-3.5 shrink-0 text-emerald-600" />
        ) : (
          <AlertCircle className="size-3.5 shrink-0 text-amber-600" />
        )}
        <span className="flex-1 truncate text-xs font-medium">{r.label}</span>
        <span className={`text-[10px] font-semibold tabular-nums ${toneText}`}>
          {r.perStore
            ? `${r.unitsWithData}/${r.totalUnits} lojas`
            : complete
              ? "importado"
              : "falta"}
        </span>
      </div>
      {r.perStore && r.missingCodes.length > 0 && (
        <p className="mt-1 truncate text-[10px] text-muted-foreground">
          faltam: {r.missingCodes.map((c) => `#${c}`).join(", ")}
        </p>
      )}
    </div>
  )
}
