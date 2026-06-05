"use client"

import { useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

import { saveUnitCosts } from "@/app/(app)/financeiro/_actions"

function toNumber(s: string): number {
  const digits = s.replace(/\D/g, "")
  return parseInt(digits || "0", 10) / 100
}
function display(n: number): string {
  return n === 0
    ? ""
    : n.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
}

/**
 * Edição inline do Custo Cozina + Custo da operação da loja, igual ao DRE
 * Grupo. Salva no blur via saveUnitCosts e dá refresh (a página recalcula a
 * margem). Máscara de centavos.
 */
export function UnitCostsEditor({
  unitId,
  year,
  month,
  cozina,
  operacao,
}: {
  unitId: string
  year: number
  month: number
  cozina: number
  operacao: number
}) {
  const router = useRouter()
  const [c, setC] = useState(cozina)
  const [o, setO] = useState(operacao)
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  )

  const save = async () => {
    if (c === cozina && o === operacao) return
    setStatus("saving")
    const res = await saveUnitCosts({
      unitId,
      year,
      month,
      custoCozina: c,
      custoOperacao: o,
    })
    if (res.ok) {
      setStatus("saved")
      router.refresh()
      setTimeout(() => setStatus("idle"), 1500)
    } else {
      setStatus("error")
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Field
        label="Custo Cozina (CMV)"
        hint="o que a fábrica faturou pra loja"
        value={c}
        onChange={setC}
        onCommit={save}
      />
      <Field
        label="Custo da operação"
        hint="aluguel, folha, etc. (opcional)"
        value={o}
        onChange={setO}
        onCommit={save}
      />
      <div className="-mt-1 flex h-4 items-center gap-1 text-[11px]">
        {status === "saving" && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> salvando…
          </span>
        )}
        {status === "saved" && (
          <span className="inline-flex items-center gap-1 text-emerald-600">
            <Check className="size-3" /> salvo
          </span>
        )}
        {status === "error" && (
          <span className="text-rose-600">erro ao salvar</span>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  value,
  onChange,
  onCommit,
}: {
  label: string
  hint: string
  value: number
  onChange: (n: number) => void
  onCommit: () => void
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium">{label}</span>
      <span className="ml-1 text-[10px] text-muted-foreground">· {hint}</span>
      <div className="relative mt-1">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          R$
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={display(value)}
          placeholder="0,00"
          onChange={(e) => onChange(toNumber(e.target.value))}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur()
          }}
          className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-right text-sm tabular-nums outline-none focus:border-ring"
        />
      </div>
    </label>
  )
}
