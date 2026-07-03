"use client"

import { HelpCircle, LogOut } from "lucide-react"

import { CommandSearch } from "@/components/command-search"
import { DashboardCustomizeButton } from "@/components/dashboard/dashboard-customize-button"
import { DashboardPrivacyToggle } from "@/components/dashboard/dashboard-privacy-toggle"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  HelpDialog,
  OPEN_HELP_EVENT,
} from "@/app/(app)/ajuda/_components/help-dialog"
import { signOut } from "@/app/login/_actions"

export function TopBar({
  userName,
  userInitials,
}: {
  userName: string
  userInitials: string
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 print:hidden">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-5" />

      <CommandSearch />

      <div className="ml-auto flex items-center gap-3">
        <div className="hidden items-center gap-2 sm:flex">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
            {userInitials}
          </div>
          <span className="text-sm font-medium">{userName}</span>
        </div>

        <div className="flex items-center gap-0.5">
          <DashboardPrivacyToggle />
          <DashboardCustomizeButton />
          <IconButton
            aria-label="Central de ajuda"
            title="Central de ajuda"
            onClick={() => window.dispatchEvent(new Event(OPEN_HELP_EVENT))}
          >
            <HelpCircle className="size-4" />
          </IconButton>
          <ThemeToggle />
          <form action={signOut}>
            <button
              type="submit"
              aria-label="Sair"
              className="relative flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>

      <HelpDialog />
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
