import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { NavigationProgress } from "@/components/shared/navigation-progress"
import { TopBar } from "@/components/top-bar"
import { WelcomeTour } from "@/components/onboarding/welcome-tour"
import { WhatsNewModal } from "@/components/whats-new-modal"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getCurrentUserContext } from "@/lib/auth/context"
import { MODULES, userCan, isSuperadmin } from "@/lib/auth/permissions"
import { daysUntil, getCurrentHoldingBilling } from "@/lib/data/billing"
import { createClient } from "@/lib/supabase/server"

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    redirect("/login")
  }

  const userContext = await getCurrentUserContext()

  // Módulos que o perfil do usuário pode "Ver" — alimenta o filtro do menu.
  const moduleChecks = await Promise.all(
    MODULES.map(async (m) => ({
      key: m.key,
      ok: await userCan(m.key, "view"),
    })),
  )
  const allowedModules = moduleChecks.filter((m) => m.ok).map((m) => m.key)
  const superadmin = await isSuperadmin()

  // Cobrança: cliente sem pagar e passou da data de suspensão → bloqueia.
  // Super-admin (dono) nunca é bloqueado.
  const billing = await getCurrentHoldingBilling()
  if (!superadmin && billing?.status === "suspended") {
    redirect("/suspenso")
  }
  const overdue = billing?.status === "overdue"
  // Teste grátis em andamento → banner com os dias restantes.
  const trialDaysLeft =
    billing?.status === "trial" && billing.trialEndsAt
      ? Math.max(0, daysUntil(billing.trialEndsAt))
      : null

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          allowedModules={allowedModules}
          isSuperadmin={superadmin}
          isPro={
            superadmin ||
            billing?.planTier === "pro" ||
            billing?.planTier === "ai"
          }
          logoUrl={userContext.logoUrl}
          companyName={userContext.companyName}
        />
        <SidebarInset>
          <TopBar
            userName={userContext.fullName}
            userInitials={userContext.initials}
          />
          {overdue && (
            <div className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-6 py-2.5 text-xs font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
              <span className="text-base leading-none">⚠️</span>
              <span>
                Pagamento em atraso
                {billing?.suspendOn
                  ? ` — regularize até ${billing.suspendOn.split("-").reverse().join("/")} pra não suspender o acesso.`
                  : " — regularize pra manter o acesso."}
              </span>
            </div>
          )}
          {trialDaysLeft !== null && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-violet-300 bg-violet-50 px-6 py-2.5 text-xs font-medium text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-300">
              <span className="text-base leading-none">🎁</span>
              <span>
                {trialDaysLeft === 0
                  ? "Seu teste grátis termina hoje."
                  : `Teste grátis — ${trialDaysLeft} dia${trialDaysLeft === 1 ? "" : "s"} restante${trialDaysLeft === 1 ? "" : "s"}.`}
              </span>
              <a
                href="/assinatura"
                className="font-semibold underline underline-offset-2 hover:opacity-80"
              >
                Assinar agora
              </a>
            </div>
          )}
          <NavigationProgress>{children}</NavigationProgress>
        </SidebarInset>
        <WelcomeTour
          initialOnboarded={userContext.onboarded}
          brandName={userContext.companyName || userContext.brandName}
        />
        <WhatsNewModal onboarded={userContext.onboarded} />
      </SidebarProvider>
    </TooltipProvider>
  )
}
