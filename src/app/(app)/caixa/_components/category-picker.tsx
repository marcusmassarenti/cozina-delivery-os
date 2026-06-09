"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronDown, Loader2, Plus, Search } from "lucide-react"

import type { FinCategory } from "@/lib/data/caixa"

import { createCategoryQuick } from "../_actions"
import { FinIcon } from "./fin-icon"

export function CategoryPicker({
  categories,
  kind,
  value,
  onChange,
}: {
  categories: FinCategory[]
  kind: "despesa" | "receita"
  value: string
  onChange: (id: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const router = useRouter()
  const [pending, start] = useTransition()

  const cats = categories.filter((c) => c.kind === kind)
  const selected = cats.find((c) => c.id === value)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const q = search.trim().toLowerCase()
  const filtered = q ? cats.filter((c) => c.name.toLowerCase().includes(q)) : cats
  const exact = cats.some((c) => c.name.toLowerCase() === q)

  function selecionar(id: string) {
    onChange(id)
    setOpen(false)
    setSearch("")
  }

  function criar() {
    const nome = search.trim()
    if (!nome) return
    start(async () => {
      const r = await createCategoryQuick(nome, kind)
      if (r.ok && r.id) {
        onChange(r.id)
        setOpen(false)
        setSearch("")
        router.refresh()
      }
    })
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center gap-2 rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
      >
        {selected && <FinIcon name={selected.icon} className="size-4 shrink-0 text-muted-foreground" />}
        <span className={`flex-1 truncate text-left ${selected ? "" : "text-muted-foreground"}`}>
          {selected ? selected.name : "Selecione"}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>
      <input type="hidden" name="category_id" value={value} />

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border bg-card shadow-xl">
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar ou criar categoria…"
                className="h-9 w-full rounded-md border bg-background pl-8 pr-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto">
            <button
              type="button"
              onClick={() => selecionar("")}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
            >
              — Sem categoria
            </button>
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => selecionar(c.id)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
              >
                <FinIcon name={c.icon} className="size-4 shrink-0 text-muted-foreground" />
                <span className={`flex-1 truncate ${c.parentId ? "pl-3 text-muted-foreground" : ""}`}>
                  {c.parentId ? "↳ " : ""}
                  {c.name}
                </span>
                {value === c.id && <Check className="size-4 text-primary" />}
              </button>
            ))}
            {filtered.length === 0 && !q && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">Nenhuma categoria.</p>
            )}
          </div>
          {q && !exact && (
            <button
              type="button"
              onClick={criar}
              disabled={pending}
              className="flex w-full items-center justify-center gap-2 border-t bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Criar “{search.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  )
}
