import { AlertCircle, Check, ClipboardCheck, Clock } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import {
  getImportChecklistForMonth,
  type Cadencia,
  type ReportStatus,
} from "@/lib/data/import-checklist"
import { formatPeriodLabel } from "@/lib/period"

const PLAT_LABEL: Record<PlatformId, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
}

const CADENCIA_LABEL: Record<Cadencia, string> = {
  diario: "diário",
  semanal: "semanal",
  mensal: "mensal",
}

const MES_ABREV = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
]

function fmtDia(d: string): string {
  const [, mm, dd] = d.split("-")
  return `${dd}/${MES_ABREV[Number(mm) - 1]}`
}

/**
 * Saúde da importação: cada relatório pela sua cadência.
 *  - Mensais por loja (iFood): completo quando todas as lojas da plataforma têm.
 *  - Diários/semanais (rede): frescor — até que dia tem dado ("em dia" = D-1).
 */
export async function ImportChecklist() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const data = await getImportChecklistForMonth(year, month)

  const pendentes = data.reports.length - data.okCount
  const platforms: PlatformId[] = ["ifood", "99food", "keeta"]

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center gap-2.5 border-b px-5 py-3">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
          <ClipboardCheck className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            Saúde da importação · {formatPeriodLabel({ year, month })}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {data.okCount} em dia · {data.atrasadoCount} a atualizar ·{" "}
            {data.faltaCount} faltando · {data.totalUnits} lojas ativas
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            pendentes === 0
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
              : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
          }`}
        >
          {data.okCount}/{data.reports.length}
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
          <strong className="text-foreground">Mensais</strong> (iFood Conciliação
          e Pedidos) precisam de 1 arquivo por loja. <strong className="text-foreground">Diários/semanais</strong>{" "}
          são 1 arquivo da rede — &quot;em dia&quot; = dado até ontem.
        </p>
      </div>
    </div>
  )
}

function ReportRow({ r }: { r: ReportStatus }) {
  const tone =
    r.status === "ok"
      ? {
          icon: <Check className="size-3.5 shrink-0 text-emerald-600" />,
          text: "text-emerald-700 dark:text-emerald-400",
        }
      : r.status === "falta"
        ? {
            icon: <AlertCircle className="size-3.5 shrink-0 text-rose-600" />,
            text: "text-rose-700 dark:text-rose-400",
          }
        : {
            icon: <Clock className="size-3.5 shrink-0 text-amber-600" />,
            text: "text-amber-700 dark:text-amber-400",
          }

  // Texto da direita por tipo
  let right: string
  if (r.perStore) {
    right =
      r.totalLinked > 0 ? `${r.unitsWithData}/${r.totalLinked} lojas` : "—"
  } else if (r.lastDate) {
    right =
      r.status === "ok"
        ? `até ${fmtDia(r.lastDate)}`
        : `atrasado ${r.lagDays}d`
  } else {
    right = "falta"
  }

  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <div className="flex items-center gap-2">
        {tone.icon}
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {r.label}
        </span>
        <span className="rounded bg-muted px-1 py-px text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
          {CADENCIA_LABEL[r.cadencia]}
        </span>
        <span
          className={`shrink-0 text-[10px] font-semibold tabular-nums ${tone.text}`}
        >
          {right}
        </span>
      </div>
      {r.perStore && r.missingCodes.length > 0 && (
        <p className="mt-1 truncate text-[10px] text-muted-foreground">
          faltam: {r.missingCodes.map((c) => `#${c}`).join(", ")}
        </p>
      )}
      {!r.perStore && r.status === "atrasado" && r.lastDate && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          último dado em {fmtDia(r.lastDate)} · re-puxe pra ficar em dia
        </p>
      )}
    </div>
  )
}
