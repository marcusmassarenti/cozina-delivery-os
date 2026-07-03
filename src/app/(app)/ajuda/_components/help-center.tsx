"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRight, Compass, Search } from "lucide-react"
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

/** Item + o ícone/rótulo da seção de onde ele veio (pra montar os tiles). */
type FlatItem = HelpItem & { sectionLabel: string; icon: LucideIcon }

const ALL: FlatItem[] = HELP_SECTIONS.flatMap((s) =>
  s.items.map((it) => ({ ...it, sectionLabel: s.label, icon: s.icon })),
)

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

export function HelpCenter({ compact = false }: { compact?: boolean }) {
  const [q, setQ] = React.useState("")
  const [selected, setSelected] = React.useState<FlatItem | null>(null)
  const query = norm(q.trim())

  const matches = React.useMemo(() => {
    if (!query) return null
    return ALL.filter((it) =>
      norm(`${it.title} ${it.oque} ${(it.como ?? []).join(" ")}`).includes(
        query,
      ),
    )
  }, [query])

  if (selected) {
    return <Detail item={selected} onBack={() => setSelected(null)} />
  }

  return (
    <div className="flex-1">
      {compact ? (
        /* Cabeçalho compacto (dentro do modal) */
        <div className="sticky top-0 z-10 border-b bg-background px-5 py-4">
          <h2 className="text-base font-semibold tracking-tight">
            Central de ajuda
          </h2>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pesquisar (ex.: CMV, importar, avaliações)..."
              className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      ) : (
        /* Hero (página cheia) */
        <div className="bg-[linear-gradient(135deg,oklch(0.62_0.2_32),oklch(0.7_0.19_48))] px-6 py-12 text-center text-white">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Central de ajuda
          </h1>
          <div className="relative mx-auto mt-5 max-w-xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pesquisar (ex.: CMV, importar, avaliações)..."
              className="w-full rounded-full border-0 bg-white py-3.5 pl-12 pr-4 text-sm text-foreground shadow-lg outline-none ring-2 ring-transparent focus:ring-white/60"
            />
          </div>
          <p className="mx-auto mt-4 max-w-md text-sm text-white/85">
            Encontre em poucos cliques o que cada tela faz e como usar.
          </p>
        </div>
      )}

      <div
        className={
          compact ? "px-5 py-5" : "mx-auto max-w-5xl px-6 py-8"
        }
      >
        {matches ? (
          matches.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Nada encontrado pra “{q}”. Tente outra palavra.
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                {matches.length} resultado{matches.length === 1 ? "" : "s"}
              </p>
              <TileGrid items={matches} onSelect={setSelected} />
            </>
          )
        ) : (
          <div className="space-y-8">
            {HELP_SECTIONS.map((sec) => (
              <section key={sec.label}>
                <div className="mb-3 flex items-center gap-2">
                  <sec.icon className="size-4 text-muted-foreground" />
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {sec.label}
                  </h2>
                </div>
                <TileGrid
                  items={sec.items.map((it) => ({
                    ...it,
                    sectionLabel: sec.label,
                    icon: sec.icon,
                  }))}
                  onSelect={setSelected}
                />
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TileGrid({
  items,
  onSelect,
}: {
  items: FlatItem[]
  onSelect: (it: FlatItem) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => (
        <button
          key={it.title}
          type="button"
          onClick={() => onSelect(it)}
          className="group flex min-h-[92px] flex-col rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
        >
          <div className="flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[oklch(0.65_0.21_35/0.1)] text-primary">
              <it.icon className="size-4" />
            </span>
            <span className="text-sm font-semibold leading-tight">
              {it.title}
            </span>
          </div>
          <span className="mt-2 line-clamp-2 text-[12px] text-muted-foreground">
            {it.oque}
          </span>
        </button>
      ))}
    </div>
  )
}

function Detail({ item, onBack }: { item: FlatItem; onBack: () => void }) {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar pra central
      </button>

      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[oklch(0.65_0.21_35/0.1)] text-primary">
            <item.icon className="size-5" />
          </span>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {item.sectionLabel}
            </p>
            <h1 className="text-lg font-semibold tracking-tight">
              {item.title}
            </h1>
          </div>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">{item.oque}</p>

        {item.como && item.como.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Como usar
            </p>
            <ul className="mt-2 space-y-1.5">
              {item.como.map((c, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {item.href && (
          <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
            <Link
              href={item.href}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Abrir tela <ArrowRight className="size-4" />
            </Link>
            {item.tourParam && (
              <Link
                href={`${item.href}?${item.tourParam}=1`}
                className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Compass className="size-4" /> Ver o passo a passo
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
