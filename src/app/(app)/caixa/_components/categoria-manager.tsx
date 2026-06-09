"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus, Sparkles, Trash2, X } from "lucide-react"

import type { FinCategory } from "@/lib/data/caixa"

import { deleteCategory, saveCategory, seedDefaultCategories } from "../_actions"
import { FIN_ICON_NAMES, FinIcon } from "./fin-icon"

export function CategoriaManager({ categories }: { categories: FinCategory[] }) {
  const [open, setOpen] = useState(false)
  const [kindTab, setKindTab] = useState<"despesa" | "receita">("despesa")
  const [icon, setIcon] = useState("Tag")
  const [color, setColor] = useState(CORES[0])
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function abrirNova() {
    setIcon("Tag")
    setColor(CORES[0])
    setError(null)
    setOpen(true)
  }

  const parents = categories.filter((c) => !c.parentId)
  const childrenOf = (pid: string) => categories.filter((c) => c.parentId === pid)
  const visibleParents = parents.filter((c) => c.kind === kindTab)

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, form?: HTMLFormElement) {
    start(async () => {
      const r = await fn()
      if (r.ok) {
        form?.reset()
        setOpen(false)
        setError(null)
        router.refresh()
      } else setError(r.message ?? "Erro")
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {(["despesa", "receita"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKindTab(k)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize ${
                kindTab === k ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              {k}s
            </button>
          ))}
        </div>
        <button
          onClick={abrirNova}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" />
          Nova categoria
        </button>
      </div>

      {categories.length === 0 && (
        <button
          onClick={() => run(() => seedDefaultCategories())}
          disabled={pending}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed bg-accent/40 py-5 text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          Criar categorias padrão de restaurante
        </button>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {visibleParents.map((p) => (
          <div key={p.id} className="rounded-xl border bg-card p-3 shadow-sm">
            <div className="flex items-center gap-2">
              <div
                className={`flex size-8 items-center justify-center rounded-lg ${
                  p.kind === "despesa"
                    ? "bg-rose-100 text-rose-600 dark:bg-rose-950/40"
                    : "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40"
                }`}
              >
                <FinIcon name={p.icon} className="size-4" />
              </div>
              <span className="flex-1 font-medium">{p.name}</span>
              <button onClick={() => confirm("Excluir categoria e subcategorias?") && run(() => deleteCategory(p.id))} className="rounded p-1 hover:bg-accent">
                <Trash2 className="size-3.5 text-muted-foreground" />
              </button>
            </div>
            {childrenOf(p.id).length > 0 && (
              <div className="mt-2 space-y-1 border-l pl-3">
                {childrenOf(p.id).map((c) => (
                  <div key={c.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FinIcon name={c.icon} className="size-3.5" />
                    <span className="flex-1">{c.name}</span>
                    <button onClick={() => confirm("Excluir subcategoria?") && run(() => deleteCategory(c.id))} className="rounded p-1 hover:bg-accent">
                      <Trash2 className="size-3 text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {visibleParents.length === 0 && categories.length > 0 && (
          <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
            Nenhuma categoria de {kindTab} ainda.
          </p>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Nova categoria</h2>
              <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-accent">
                <X className="size-4" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                run(() => saveCategory(new FormData(e.currentTarget)), e.currentTarget)
              }}
              className="space-y-3"
            >
              <Field label="Nome">
                <input name="name" required placeholder="Ex: Aluguel" className={inputCls} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Tipo">
                  <select name="kind" defaultValue={kindTab} className={inputCls}>
                    <option value="despesa">Despesa</option>
                    <option value="receita">Receita</option>
                  </select>
                </Field>
                <Field label="Subcategoria de (opcional)">
                  <select name="parent_id" defaultValue="" className={inputCls}>
                    <option value="">— principal</option>
                    {parents.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {/* Ícone — grade visual */}
              <div>
                <span className="mb-1 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                  Ícone
                  <span
                    style={{ backgroundColor: `${color}22`, color }}
                    className="flex size-5 items-center justify-center rounded-md"
                  >
                    <FinIcon name={icon} className="size-3" />
                  </span>
                </span>
                <input type="hidden" name="icon" value={icon} />
                <div className="grid grid-cols-8 gap-1.5">
                  {FIN_ICON_NAMES.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setIcon(n)}
                      className={`flex aspect-square items-center justify-center rounded-lg border ${
                        icon === n
                          ? "border-primary bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      <FinIcon name={n} className="size-4" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Cor */}
              <div>
                <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Cor</span>
                <input type="hidden" name="color" value={color} />
                <div className="flex flex-wrap gap-1.5">
                  {CORES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      style={{ backgroundColor: c }}
                      className={`size-6 rounded-full ${
                        color === c ? "ring-2 ring-foreground ring-offset-2" : ""
                      }`}
                    />
                  ))}
                </div>
              </div>
              {error && <p className="text-xs text-rose-600">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} className="rounded-md border px-3 py-2 text-sm hover:bg-accent">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {pending && <Loader2 className="size-3.5 animate-spin" />}
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const CORES = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#78716c",
  "#94a3b8",
]

const inputCls =
  "h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
