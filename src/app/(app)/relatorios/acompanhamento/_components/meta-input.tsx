"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { fmtBRL } from "@/lib/format"
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
  const [editing, setEditing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const lastSaved = React.useRef(initial)

  async function commit() {
    setEditing(false)
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

  const numeric = parseBr(value)
  // Ao focar mostra o número cru (fácil de editar); fora de foco mostra
  // formatado "R$ 300.000,00".
  const display = editing ? value : numeric > 0 ? fmtBRL(numeric) : ""

  return (
    <>
      {/* Editável na tela */}
      <input
        type="text"
        inputMode="decimal"
        value={display}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setEditing(true)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
        }}
        placeholder="definir"
        title="Clique e digite a meta de faturamento do mês"
        className="w-28 rounded border border-input bg-muted/40 px-1.5 py-0.5 text-right text-xs tabular-nums placeholder:text-muted-foreground/60 placeholder:italic hover:border-primary/60 focus:border-primary focus:bg-background focus:outline-none disabled:opacity-50 print:hidden print:border-none print:bg-transparent"
      />
      {/* Só texto no PDF (sem a caixa do input, pra a linha ficar baixa) */}
      <span className="hidden tabular-nums print:inline">
        {numeric > 0 ? fmtBRL(numeric) : "—"}
      </span>
    </>
  )
}
