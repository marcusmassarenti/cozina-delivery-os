"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { saveMetaFaturamento } from "../_actions"

function parseBr(s: string): number {
  const cleaned = s
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

/** Célula editável da Meta — salva no blur/Enter. Em impressão vira só o número. */
export function MetaInput({
  unitId,
  year,
  month,
  initial,
}: {
  unitId: string
  year: number
  month: number
  initial: number
}) {
  const router = useRouter()
  const [value, setValue] = React.useState(initial > 0 ? String(initial) : "")
  const [saving, setSaving] = React.useState(false)
  const lastSaved = React.useRef(initial)

  async function commit() {
    const meta = parseBr(value)
    if (meta === lastSaved.current) return
    setSaving(true)
    const res = await saveMetaFaturamento({ unitId, year, month, meta })
    setSaving(false)
    if (res.ok) {
      lastSaved.current = meta
      router.refresh()
    }
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      disabled={saving}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
      }}
      placeholder="—"
      className="w-24 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-right text-xs tabular-nums hover:border-input focus:border-primary focus:outline-none disabled:opacity-50 print:border-none"
    />
  )
}
