"use client"

import { useState, useTransition } from "react"
import { Check, Loader2, RefreshCw, Save } from "lucide-react"

import { fmtBRL } from "@/lib/format"
import type { NinefoodSyncUnit } from "@/lib/data/ninefood-api"

import {
  setNinefoodStoreId,
  syncNinefoodUnit,
  type SyncNinefoodState,
} from "../_actions"

export function NinefoodSync({
  units,
  year,
  month,
  monthLabel,
}: {
  units: NinefoodSyncUnit[]
  year: number
  month: number
  monthLabel: string
}) {
  if (units.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nenhuma loja com <strong>99 Food</strong> ativo. Ative a plataforma numa
        unidade (em Unidades) pra poder sincronizar o financeiro por API.
      </p>
    )
  }
  return (
    <div className="space-y-2">
      {units.map((u) => (
        <UnitRow
          key={u.unitId}
          unit={u}
          year={year}
          month={month}
          monthLabel={monthLabel}
        />
      ))}
    </div>
  )
}

function UnitRow({
  unit,
  year,
  month,
  monthLabel,
}: {
  unit: NinefoodSyncUnit
  year: number
  month: number
  monthLabel: string
}) {
  const [shopId, setShopId] = useState(unit.appShopId ?? "")
  const [committed, setCommitted] = useState(unit.appShopId ?? "")
  const [savePending, startSave] = useTransition()
  const [syncPending, startSync] = useTransition()
  const [result, setResult] = useState<SyncNinefoodState | null>(null)

  const dirty = committed.trim() !== shopId.trim()

  function save() {
    const fd = new FormData()
    fd.set("unitId", unit.unitId)
    fd.set("appShopId", shopId.trim())
    startSave(async () => {
      const r = await setNinefoodStoreId(fd)
      if (r.ok) {
        setCommitted(shopId.trim())
        setResult(null)
      } else {
        setResult({ ok: false, message: r.message })
      }
    })
  }

  function sync() {
    const fd = new FormData()
    fd.set("unitId", unit.unitId)
    fd.set("year", String(year))
    fd.set("month", String(month))
    startSync(async () => {
      setResult(await syncNinefoodUnit(fd))
    })
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[120px] flex-1">
          <div className="text-sm font-medium">{unit.name}</div>
          <div className="text-[10px] text-muted-foreground">
            {unit.code} · {unit.syncedRows} reg. no banco
          </div>
        </div>
        <input
          value={shopId}
          onChange={(e) => setShopId(e.target.value)}
          placeholder="app_shop_id (ex.: cnp-jardins)"
          className="h-8 w-48 rounded-md border bg-background px-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={save}
          disabled={savePending || !dirty}
          className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium hover:bg-accent disabled:opacity-50"
        >
          {savePending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : !dirty && committed ? (
            <Check className="size-3 text-emerald-600" />
          ) : (
            <Save className="size-3" />
          )}
          Salvar
        </button>
        <button
          type="button"
          onClick={sync}
          disabled={syncPending || !committed || dirty}
          title={dirty ? "Salve o app_shop_id antes de sincronizar" : ""}
          className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {syncPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <RefreshCw className="size-3" />
          )}
          Sincronizar {monthLabel}
        </button>
      </div>
      {result && (
        <div
          className={`mt-2 rounded-md px-2 py-1 text-[11px] ${
            result.ok
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
          }`}
        >
          {result.ok
            ? `✓ ${result.fetched ?? 0} transações · ${result.upserted ?? 0} gravadas · líquido ${fmtBRL(result.liquido ?? 0)}`
            : `✗ ${result.message}`}
        </div>
      )}
    </div>
  )
}
