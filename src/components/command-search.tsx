"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { CornerDownLeft, Search } from "lucide-react"

import { NAV_ITEMS } from "@/lib/nav"

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
}

/**
 * Busca de menus estilo paleta de comandos. Abre com Cmd/Ctrl+K ou clicando.
 * Filtra os itens do menu e navega no Enter/clique.
 */
export function CommandSearch() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [active, setActive] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const results = React.useMemo(() => {
    const q = norm(query)
    if (!q) return NAV_ITEMS
    return NAV_ITEMS.filter(
      (i) => norm(i.label).includes(q) || norm(i.group ?? "").includes(q),
    )
  }, [query])

  // Atalho global Cmd/Ctrl+K
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  React.useEffect(() => {
    if (open) {
      setQuery("")
      setActive(0)
      // foco no input depois do paint
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  React.useEffect(() => {
    setActive(0)
  }, [query])

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const item = results[active]
      if (item) go(item.href)
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <>
      {/* Trigger (parece a barra de busca) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative hidden h-9 w-full max-w-sm flex-1 items-center rounded-md border bg-muted/40 pl-9 pr-12 text-sm text-muted-foreground transition-colors hover:bg-background md:flex"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
        Buscar menus...
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 select-none items-center gap-0.5 rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium sm:inline-flex">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-xl border bg-popover shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Buscar menus..."
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-80 overflow-auto p-1.5">
              {results.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Nenhum menu encontrado.
                </p>
              ) : (
                results.map((item, i) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.href}
                      type="button"
                      onClick={() => go(item.href)}
                      onMouseEnter={() => setActive(i)}
                      className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm ${
                        i === active
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground"
                      }`}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1">{item.label}</span>
                      {item.group && (
                        <span className="text-[11px] text-muted-foreground">
                          {item.group}
                        </span>
                      )}
                      {i === active && (
                        <CornerDownLeft className="size-3.5 text-muted-foreground" />
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
