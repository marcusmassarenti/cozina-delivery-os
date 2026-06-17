"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Check, Link2, Link2Off, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import {
  linkMerchantToUnit,
  refreshMerchants,
  unlinkMerchant,
  type LinkMerchantState,
  type RefreshMerchantsState,
} from "../_actions"

type UnitOption = { id: string; code: string; name: string }

export function LinkRow({
  merchantId,
  currentUnitId,
  units,
}: {
  merchantId: string
  currentUnitId: string | null
  units: UnitOption[]
}) {
  const [linkState, linkAction] = useActionState<LinkMerchantState, FormData>(
    linkMerchantToUnit,
    { ok: false },
  )
  const [unlinkState, unlinkAction] = useActionState<LinkMerchantState, FormData>(
    unlinkMerchant,
    { ok: false },
  )
  const [selectedUnit, setSelectedUnit] = React.useState<string>(
    currentUnitId ?? "",
  )

  if (currentUnitId) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
          <Check className="size-3" /> Vinculado
        </span>
        <form action={unlinkAction}>
          <input type="hidden" name="merchantId" value={merchantId} />
          <UnlinkBtn />
        </form>
        {unlinkState.error && (
          <span className="text-[10px] text-rose-600">{unlinkState.error}</span>
        )}
      </div>
    )
  }

  return (
    <form action={linkAction} className="flex items-center gap-2">
      <input type="hidden" name="merchantId" value={merchantId} />
      <input type="hidden" name="unitId" value={selectedUnit} />
      <Select
        value={selectedUnit}
        onValueChange={(v) => setSelectedUnit(v ?? "")}
      >
        <SelectTrigger className="h-7 w-[200px] text-xs">
          <SelectValue placeholder="Escolher unidade…" />
        </SelectTrigger>
        <SelectContent>
          {units.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.code} — {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <LinkBtn />
      {linkState.error && (
        <span className="text-[10px] text-rose-600">{linkState.error}</span>
      )}
    </form>
  )
}

function LinkBtn() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" className="h-7 gap-1 px-2 text-xs" disabled={pending}>
      <Link2 className="size-3" />
      {pending ? "..." : "Vincular"}
    </Button>
  )
}

function UnlinkBtn() {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      size="sm"
      variant="ghost"
      className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-rose-600"
      disabled={pending}
    >
      <Link2Off className="size-3" />
      {pending ? "..." : "Desvincular"}
    </Button>
  )
}

export function RefreshButton() {
  const [state, action] = useActionState<RefreshMerchantsState, FormData>(
    refreshMerchants,
    { ok: false },
  )
  return (
    <form action={action} className="flex items-center gap-2">
      <RefreshBtn />
      {state.count != null && (
        <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
          {state.count} merchant(s) sincronizado(s)
        </span>
      )}
      {state.error && (
        <span className="text-[11px] text-rose-600">{state.error}</span>
      )}
    </form>
  )
}

function RefreshBtn() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" variant="outline" className="gap-1.5" disabled={pending}>
      <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Sincronizando..." : "Re-puxar da Merchant API"}
    </Button>
  )
}
