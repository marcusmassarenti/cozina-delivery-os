"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { CalendarDays, Trash2 } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { fmtBRL, fmtPct } from "@/lib/format"
import { saveDailyEntry, deleteDailyEntry, type ActionState } from "../_actions"

const initial: ActionState = { ok: false }

export type DailyEntryInitial = {
  date: string // YYYY-MM-DD
  ifood: { pedidos: number; cancelados: number; faturamento: number }
  "99food": { pedidos: number; cancelados: number; faturamento: number }
  keeta: { pedidos: number; cancelados: number; faturamento: number }
}

const PLATFORMS: { id: PlatformId; label: string }[] = [
  { id: "ifood", label: "iFood" },
  { id: "99food", label: "99 Food" },
  { id: "keeta", label: "Keeta" },
]

const emptyPlatform = { pedidos: 0, cancelados: 0, faturamento: 0 }

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

export function DailyEntryDialog({
  unitId,
  open,
  onOpenChange,
  initial: initialData,
  unitActivePlatforms,
}: {
  unitId: string
  open: boolean
  onOpenChange: (v: boolean) => void
  initial: DailyEntryInitial | null
  unitActivePlatforms: PlatformId[]
}) {
  const [state, formAction] = useActionState(saveDailyEntry, initial)
  const [date, setDate] = React.useState(initialData?.date ?? todayISO())
  const [data, setData] = React.useState(
    initialData ?? {
      date: todayISO(),
      ifood: { ...emptyPlatform },
      "99food": { ...emptyPlatform },
      keeta: { ...emptyPlatform },
    },
  )
  const router = useRouter()
  const isEdit = !!initialData

  React.useEffect(() => {
    if (open) {
      const init = initialData ?? {
        date: todayISO(),
        ifood: { ...emptyPlatform },
        "99food": { ...emptyPlatform },
        keeta: { ...emptyPlatform },
      }
      setData(init)
      setDate(init.date)
    }
  }, [open, initialData])

  React.useEffect(() => {
    if (state.ok) {
      onOpenChange(false)
      router.refresh()
    }
  }, [state, onOpenChange, router])

  const updateField = (
    platform: PlatformId,
    field: "pedidos" | "cancelados" | "faturamento",
    value: number,
  ) => {
    setData((prev) => ({
      ...prev,
      [platform]: { ...prev[platform], [field]: value },
    }))
  }

  const totalPedidos =
    data.ifood.pedidos + data["99food"].pedidos + data.keeta.pedidos
  const totalCancelados =
    data.ifood.cancelados +
    data["99food"].cancelados +
    data.keeta.cancelados
  const totalFaturamento =
    data.ifood.faturamento +
    data["99food"].faturamento +
    data.keeta.faturamento
  const ticketMedio = totalPedidos > 0 ? totalFaturamento / totalPedidos : 0
  const pctCancelamento =
    totalPedidos > 0 ? (totalCancelados / totalPedidos) * 100 : 0

  const onDelete = async () => {
    if (!confirm("Tem certeza que quer deletar esse lançamento do dia?")) return
    const res = await deleteDailyEntry(unitId, date)
    if (res.ok) {
      onOpenChange(false)
      router.refresh()
    } else {
      alert(res.message ?? "Erro ao deletar")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="size-5 text-primary" />
            {isEdit ? "Editar lançamento" : "Novo lançamento"} ·{" "}
            {formatDateBR(date)}
          </DialogTitle>
          <DialogDescription>
            Preencha pedidos, cancelamentos e faturamento por plataforma. Ticket
            médio e % de cancelamento são calculados automaticamente.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="unitId" value={unitId} />
          <input type="hidden" name="date" value={date} />

          {!isEdit && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">Data</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          )}

          {/* Plataformas */}
          <div className="grid gap-3 sm:grid-cols-3">
            {PLATFORMS.map((p) => {
              const isActive = unitActivePlatforms.includes(p.id)
              const v = data[p.id]
              return (
                <div
                  key={p.id}
                  className={`flex flex-col gap-2 rounded-lg border p-3 ${
                    isActive ? "" : "opacity-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <PlatformLogo platform={p.id} size="sm" />
                    <span className="text-xs font-semibold">{p.label}</span>
                    {!isActive && (
                      <span className="ml-auto text-[9px] text-muted-foreground">
                        inativa
                      </span>
                    )}
                  </div>
                  <PlatformField
                    label="Pedidos"
                    name={`${p.id}_pedidos`}
                    value={v.pedidos}
                    integer
                    onChange={(n) => updateField(p.id, "pedidos", n)}
                  />
                  <PlatformField
                    label="Cancelados"
                    name={`${p.id}_cancelados`}
                    value={v.cancelados}
                    integer
                    onChange={(n) => updateField(p.id, "cancelados", n)}
                  />
                  <PlatformField
                    label="Faturamento"
                    name={`${p.id}_faturamento`}
                    value={v.faturamento}
                    onChange={(n) => updateField(p.id, "faturamento", n)}
                    prefix="R$"
                  />
                </div>
              )
            })}
          </div>

          {/* Totais */}
          <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/50 p-4 sm:grid-cols-4">
            <Summary label="Pedidos" value={String(totalPedidos)} />
            <Summary
              label="Cancelados"
              value={`${totalCancelados} (${fmtPct(pctCancelamento)})`}
            />
            <Summary
              label="Faturamento"
              value={fmtBRL(totalFaturamento)}
              highlight
            />
            <Summary label="Ticket médio" value={fmtBRL(ticketMedio)} />
          </div>

          {state.message && !state.ok && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
              {state.message}
            </div>
          )}

          <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
            {isEdit ? (
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:hover:bg-rose-950/30"
              >
                <Trash2 className="size-3.5" />
                Deletar dia
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <SubmitButton />
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PlatformField({
  label,
  name,
  value,
  integer,
  prefix,
  onChange,
}: {
  label: string
  name: string
  value: number
  integer?: boolean
  prefix?: string
  onChange: (n: number) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
            {prefix}
          </span>
        )}
        <Input
          name={name}
          type="number"
          inputMode={integer ? "numeric" : "decimal"}
          step={integer ? "1" : "0.01"}
          min="0"
          value={value === 0 ? "" : String(value)}
          onChange={(e) =>
            onChange(
              integer
                ? parseInt(e.target.value || "0", 10) || 0
                : parseFloat(e.target.value || "0") || 0,
            )
          }
          placeholder="0"
          className={`h-8 text-sm ${prefix ? "pl-7" : ""}`}
        />
      </div>
    </div>
  )
}

function Summary({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-0.5 text-sm font-bold tabular-nums ${
          highlight ? "text-emerald-600 dark:text-emerald-400" : ""
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
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando..." : "Salvar dia"}
    </Button>
  )
}
