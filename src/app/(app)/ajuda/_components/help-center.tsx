"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, ChevronDown, Compass, Search } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { HELP_SECTIONS } from "./help-content"

export type HelpItem = {
  title: string
  /** O que a tela é / pra que serve. */
  oque: string
  /** Passos ou dicas de uso. */
  como?: string[]
  /** Link pra abrir a tela. */
  href?: string
  /** Query pra disparar o tour guiado (ex.: "guia"). */
  tourParam?: string
}

export type HelpSection = {
  label: string
  icon: LucideIcon
  items: HelpItem[]
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

export function HelpCenter() {
  const [q, setQ] = React.useState("")
  const query = norm(q.trim())

  const filtered = React.useMemo(() => {
    if (!query) return HELP_SECTIONS
    return HELP_SECTIONS
      .map((sec) => ({
        ...sec,
        items: sec.items.filter((it) =>
          norm(`${it.title} ${it.oque} ${(it.como ?? []).join(" ")}`).includes(
            query,
          ),
        ),
      }))
      .filter((sec) => sec.items.length > 0)
  }, [query])

  const totalItems = filtered.reduce((n, s) => n + s.items.length, 0)

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Central de ajuda
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          O que cada tela faz e como usar. Busque pelo nome ou pelo que você
          quer fazer.
        </p>
      </div>

      <div className="relative mb-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar (ex.: CMV, importar, avaliações, permissão)..."
          className="w-full rounded-lg border bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {query && (
        <p className="mb-3 text-xs text-muted-foreground">
          {totalItems === 0
            ? "Nada encontrado — tente outra palavra."
            : `${totalItems} resultado${totalItems === 1 ? "" : "s"}.`}
        </p>
      )}

      <div className="space-y-6">
        {filtered.map((sec) => (
          <section key={sec.label}>
            <div className="mb-2 flex items-center gap-2">
              <sec.icon className="size-4 text-muted-foreground" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {sec.label}
              </h2>
            </div>
            <div className="space-y-2">
              {sec.items.map((it) => (
                <HelpCard key={it.title} item={it} defaultOpen={!!query} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function HelpCard({
  item,
  defaultOpen,
}: {
  item: HelpItem
  defaultOpen: boolean
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  React.useEffect(() => setOpen(defaultOpen), [defaultOpen])

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span className="text-sm font-medium">{item.title}</span>
        <ChevronDown
          className={`ml-auto size-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div className="border-t px-4 py-3">
          <p className="text-sm text-muted-foreground">{item.oque}</p>
          {item.como && item.como.length > 0 && (
            <ul className="mt-2 space-y-1">
              {item.como.map((c, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-[13px] text-muted-foreground"
                >
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                  {c}
                </li>
              ))}
            </ul>
          )}
          {item.href && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={item.href}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:opacity-90"
              >
                Abrir tela <ArrowRight className="size-3.5" />
              </Link>
              {item.tourParam && (
                <Link
                  href={`${item.href}?${item.tourParam}=1`}
                  className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Compass className="size-3.5" /> Ver o passo a passo
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
