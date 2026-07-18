"use client"

import Link from "next/link"
import { ArrowUp, LogOut, Sparkles } from "lucide-react"

import { CommandSearch } from "@/components/command-search"
import { DashboardCustomizeButton } from "@/components/dashboard/dashboard-customize-button"
import { DashboardPrivacyToggle } from "@/components/dashboard/dashboard-privacy-toggle"
import { HelpMenu } from "@/components/help-menu"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { HelpDialog } from "@/app/(app)/ajuda/_components/help-dialog"
import { signOut } from "@/app/login/_actions"

export function TopBar({
  userName,
  userInitials,
  planTier,
  billingStatus,
  isSuperadmin = false,
}: {
  userName: string
  userInitials: string
  planTier?: string | null
  billingStatus?: string
  isSuperadmin?: boolean
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 print:hidden">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-5" />

      <CommandSearch />

      <div className="ml-auto flex items-center gap-3">
        <PlanBadge
          planTier={planTier ?? null}
          billingStatus={billingStatus}
          isSuperadmin={isSuperadmin}
        />
        <div className="hidden items-center gap-2 sm:flex">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
            {userInitials}
          </div>
          <span className="text-sm font-medium">{userName}</span>
        </div>

        <div className="flex items-center gap-0.5">
          <DashboardPrivacyToggle />
          <DashboardCustomizeButton />
          <HelpMenu />
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

/**
 * Selo do plano perto do nome. No plano top (DeliveryOS AI) mostra o selo
 * branded; nos planos menores mostra o plano + um atalho de Upgrade sempre à
 * mão. No trial, incentiva assinar. Super-admin (dono) não tem plano → sem selo.
 */
function PlanBadge({
  planTier,
  billingStatus,
  isSuperadmin,
}: {
  planTier: string | null
  billingStatus?: string
  isSuperadmin: boolean
}) {
  if (isSuperadmin) return null

  const upgradeChip =
    "inline-flex items-center gap-0.5 rounded-full border border-primary/30 bg-primary/5 px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10"

  if (billingStatus === "trial") {
    return (
      <div className="hidden items-center gap-1.5 md:flex">
        <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
          Teste grátis
        </span>
        <Link href="/assinatura" className={upgradeChip}>
          <Sparkles className="size-3" />
          Assinar
        </Link>
      </div>
    )
  }

  const LABEL: Record<string, string> = {
    essencial: "Essencial",
    pro: "Pro",
    ai: "DeliveryOS AI",
  }
  const label = planTier ? LABEL[planTier] : null
  if (!label) return null // plano custom/sem self-service → sem selo

  const isAi = planTier === "ai"
  return (
    <div className="hidden items-center gap-1.5 md:flex">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
          isAi ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        }`}
      >
        {isAi && <Sparkles className="size-3" />}
        {label}
      </span>
      {!isAi && (
        <Link href="/assinatura?plano=ai" className={upgradeChip}>
          <ArrowUp className="size-3" />
          Upgrade
        </Link>
      )}
    </div>
  )
}
