"use client"

import { Bell, Expand, Flame, LogOut, RefreshCw, Search } from "lucide-react"

import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"

export function TopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-5" />

      <div className="relative hidden flex-1 max-w-sm md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="Buscar..."
          className="h-9 w-full rounded-md border bg-muted/40 pl-9 pr-12 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:bg-background"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 select-none items-center gap-0.5 rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
          ⌘K
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="hidden items-center gap-2 sm:flex">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
            M
          </div>
          <span className="text-sm font-medium">Marcus Massarenti</span>
        </div>

        <button
          type="button"
          className="hidden items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 md:inline-flex"
        >
          <Flame className="size-3.5 text-[#ff4d1c]" />
          Churrasco no Pote
        </button>

        <div className="flex items-center gap-0.5">
          <IconButton aria-label="Tela cheia">
            <Expand className="size-4" />
          </IconButton>
          <ThemeToggle />
          <IconButton aria-label="Notificações">
            <Bell className="size-4" />
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
              9
            </span>
          </IconButton>
          <IconButton aria-label="Recarregar">
            <RefreshCw className="size-4" />
          </IconButton>
          <IconButton aria-label="Sair">
            <LogOut className="size-4" />
          </IconButton>
        </div>
      </div>
    </header>
  )
}

function IconButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="relative flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      {...props}
    >
      {children}
    </button>
  )
}
