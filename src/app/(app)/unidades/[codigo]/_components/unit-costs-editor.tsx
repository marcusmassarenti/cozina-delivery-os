"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronDown, Loader2, Plus, Trash2 } from "lucide-react"

import {
  addCostCategory,
  deleteCostCategory,
  renameCostCategory,
  saveCostValue,
} from "@/app/(app)/financeiro/_actions"
import type { CostTipo, UnitCostBreakdown } from "@/lib/data/unit-costs"

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
function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

type Row = { id: string; nome: string; valor: number }

/**
 * Custos da loja por CATEGORIA. Duas seções colapsáveis (CMV e Operacional).
 * Fechada mostra o total; aberta lista as categorias (nome + R$ do mês) + botão
 * de adicionar. Cada unidade tem as suas; cada mês entra em branco.
 *
 * É OTIMISTA: toda mudança aparece na hora no estado local e o servidor grava
 * em segundo plano. A DRE ao lado é atualizada com um router.refresh() com
 * debounce (~0,7s depois que você para de editar) — sem remontar este card.
 */
export function UnitCostsEditor({
  unitId,
  year,
  month,
  cmvLegacy,
  operacaoLegacy,
  breakdown,
}: {
  unitId: string
  year: number
  month: number
  cmvLegacy: number
  operacaoLegacy: number
  breakdown: UnitCostBreakdown
}) {
  const router = useRouter()
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleRefresh = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => router.refresh(), 700)
  }, [router])
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const toRows = (t: CostTipo): Row[] =>
    breakdown.categories
      .filter((c) => c.tipo === t)
      .map((c) => ({ id: c.id, nome: c.nome, valor: c.valor }))

  return (
    <div className="flex flex-col gap-2.5">
      <CostSection
        tipo="cmv"
        title="CMV"
        hint="mercadoria vendida"
        unitId={unitId}
        year={year}
        month={month}
        initial={toRows("cmv")}
        legacy={cmvLegacy}
        scheduleRefresh={scheduleRefresh}
      />
      <CostSection
        tipo="operacao"
        title="Custos operacionais"
        hint="aluguel, folha, etc."
        unitId={unitId}
        year={year}
        month={month}
        initial={toRows("operacao")}
        legacy={operacaoLegacy}
        scheduleRefresh={scheduleRefresh}
      />
    </div>
  )
}

function CostSection({
  tipo,
  title,
  hint,
  unitId,
  year,
  month,
  initial,
  legacy,
  scheduleRefresh,
}: {
  tipo: CostTipo
  title: string
  hint: string
  unitId: string
  year: number
  month: number
  initial: Row[]
  legacy: number
  scheduleRefresh: () => void
}) {
  const [rows, setRows] = React.useState<Row[]>(initial)
  const [open, setOpen] = React.useState(false)
  const [adding, setAdding] = React.useState(false)
  const [newName, setNewName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const focusId = React.useRef<string | null>(null)

  const hasRows = rows.length > 0
  const total = hasRows ? rows.reduce((s, r) => s + r.valor, 0) : legacy

  async function add() {
    const nome = newName.trim()
    if (!nome || busy) return
    setBusy(true)
    // 1ª categoria do tipo com valor legado → o servidor move o valor pra ela;
    // refletimos isso na hora pra não "sumir" o total.
    const seed = rows.length === 0 && legacy > 0 ? legacy : 0
    const res = await addCostCategory({ unitId, nome, tipo, year, month })
    setBusy(false)
    if (res.ok && res.id) {
      focusId.current = res.id
      setRows((r) => [...r, { id: res.id!, nome, valor: seed }])
      setNewName("")
      setAdding(false)
      setOpen(true)
    }
  }

  function onValor(id: string, valor: number) {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, valor } : x)))
    scheduleRefresh()
  }
  function onNome(id: string, nome: string) {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, nome } : x)))
  }
  function onRemove(id: string) {
    setRows((r) => r.filter((x) => x.id !== id))
    scheduleRefresh()
  }

  return (
    <div className="rounded-lg border bg-background">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "" : "-rotate-90"
          }`}
        />
        <span className="text-sm font-medium">{title}</span>
        <span className="text-[10px] text-muted-foreground">· {hint}</span>
        <span className="ml-auto text-sm font-semibold tabular-nums">
          {total > 0 ? fmtBRL(total) : "—"}
        </span>
      </button>

      {open && (
        <div className="border-t px-3 py-2.5">
          {hasRows ? (
            <div className="flex flex-col gap-1.5">
              {rows.map((row) => (
                <CategoryRow
                  key={row.id}
                  row={row}
                  unitId={unitId}
                  year={year}
                  month={month}
                  autoFocus={focusId.current === row.id}
                  onValor={onValor}
                  onNome={onNome}
                  onRemove={onRemove}
                />
              ))}
            </div>
          ) : (
            legacy > 0 && (
              <p className="mb-2 rounded-md bg-muted/50 px-2.5 py-2 text-[11px] text-muted-foreground">
                Custo atual: <b>{fmtBRL(legacy)}</b>. Adicione uma categoria pra
                detalhar — esse valor é movido pra ela (você divide depois).
              </p>
            )
          )}

          {adding ? (
            <div className="mt-2 flex items-center gap-1.5">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") add()
                  if (e.key === "Escape") setAdding(false)
                }}
                placeholder="Nome da categoria (ex.: Bebidas)"
                className="h-8 flex-1 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
              />
              <button
                type="button"
                onClick={add}
                disabled={busy || !newName.trim()}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Adicionar"}
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="h-8 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <Plus className="size-3.5" />
              Adicionar categoria
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function CategoryRow({
  row,
  unitId,
  year,
  month,
  autoFocus,
  onValor,
  onNome,
  onRemove,
}: {
  row: Row
  unitId: string
  year: number
  month: number
  autoFocus: boolean
  onValor: (id: string, valor: number) => void
  onNome: (id: string, nome: string) => void
  onRemove: (id: string) => void
}) {
  const [nome, setNome] = React.useState(row.nome)
  const [valor, setValor] = React.useState(row.valor)
  const [status, setStatus] = React.useState<"idle" | "saving" | "saved">("idle")
  const valRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (autoFocus) valRef.current?.focus()
    // roda só na montagem da linha recém-criada
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function saveValor() {
    if (valor === row.valor) return
    onValor(row.id, valor) // otimista: total + DRE
    setStatus("saving")
    const res = await saveCostValue({
      unitId,
      categoryId: row.id,
      year,
      month,
      valor,
    })
    setStatus(res.ok ? "saved" : "idle")
    if (res.ok) setTimeout(() => setStatus("idle"), 1000)
  }

  async function saveNome() {
    const n = nome.trim()
    if (!n) {
      setNome(row.nome)
      return
    }
    if (n === row.nome) return
    onNome(row.id, n)
    await renameCostCategory({ unitId, categoryId: row.id, nome: n })
  }

  function remove() {
    onRemove(row.id) // otimista
    void deleteCostCategory({ unitId, categoryId: row.id, year, month })
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onBlur={saveNome}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
        }}
        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm outline-none hover:border-border focus:border-ring"
      />
      <div className="relative w-28 shrink-0">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          R$
        </span>
        <input
          ref={valRef}
          type="text"
          inputMode="numeric"
          value={display(valor)}
          placeholder="0,00"
          onChange={(e) => setValor(toNumber(e.target.value))}
          onBlur={saveValor}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur()
          }}
          className="h-8 w-full rounded-md border bg-background pl-7 pr-2 text-right text-sm tabular-nums outline-none focus:border-ring"
        />
      </div>
      {status === "saving" ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      ) : status === "saved" ? (
        <Check className="size-3.5 shrink-0 text-emerald-600" />
      ) : (
        <button
          type="button"
          onClick={remove}
          aria-label="Remover categoria"
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  )
}
