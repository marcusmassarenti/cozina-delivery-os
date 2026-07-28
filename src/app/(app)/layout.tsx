import { redirect } from "next/navigation"
import { after } from "next/server"

import { AppSidebar } from "@/components/app-sidebar"
import { NavigationProgress } from "@/components/shared/navigation-progress"
import { TopBar } from "@/components/top-bar"
import { WelcomeTour } from "@/components/onboarding/welcome-tour"
import { WelcomeSubscribedModal } from "@/components/welcome-subscribed-modal"
import { WhatsNewModal } from "@/components/whats-new-modal"
import { NinoCortesiaModal } from "@/components/nino-cortesia-modal"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getCurrentUserContext } from "@/lib/auth/context"
import { getMfaStatus } from "@/lib/auth/mfa"
import { MODULES, userCan, isSuperadmin, getCurrentHoldingId } from "@/lib/auth/permissions"
import { daysUntil, getCurrentHoldingBilling } from "@/lib/data/billing"
import { enviarBoasVindasSePreciso } from "@/lib/email/boas-vindas"
import { iniciarTrialSePrimeiroAcesso } from "@/lib/data/trial"
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

  // 2FA: quem ativou passou pela senha mas ainda deve o código. Sem esta trava
  // aqui — no layout que envolve TODAS as telas autenticadas — o segundo fator
  // seria decorativo: bastaria digitar a URL de qualquer página pra entrar.
  const mfa = await getMfaStatus()
  if (mfa.precisaVerificar) {
    redirect("/login/verificacao")
  }

  // "Último acesso" real: marca atividade (throttle de 5 min no RPC). Não
  // bloqueia a renderização — se falhar, segue a vida.
  void supabase.rpc("touch_last_seen")

  const userContext = await getCurrentUserContext()

  // Boas-vindas no primeiro acesso. `after` = roda depois da resposta ir
  // embora, então não custa nada no tempo de carregar a tela. A própria função
  // sai fora em duas linhas quando o e-mail já foi enviado (que é o caso em
  // 99,9% dos carregamentos).
  after(async () => {
    const holdingId = await getCurrentHoldingId()
    // Antes do e-mail: se este for o primeiro acesso, o teste começa a contar
    // agora — não na data em que a pessoa se cadastrou.
    await iniciarTrialSePrimeiroAcesso(holdingId)
    await enviarBoasVindasSePreciso({
      userId: data.user.id,
      email: data.user.email,
      emailConfirmado: Boolean(data.user.email_confirmed_at),
      nome: userContext.fullName,
      holdingId,
    })
  })

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
            planTier={billing?.planTier ?? null}
            billingStatus={billing?.status}
            isSuperadmin={superadmin}
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
        <WhatsNewModal
          onboarded={userContext.onboarded}
          lastSeenVersion={userContext.lastSeenVersion}
        />
        <NinoCortesiaModal
          ativa={
            !superadmin &&
            !!billing?.ninoTrialEndsAt &&
            new Date(billing.ninoTrialEndsAt) > new Date() &&
            billing.status !== "trial" &&
            billing.planTier !== "ai"
          }
          ate={billing?.ninoTrialEndsAt ?? null}
        />
        <WelcomeSubscribedModal userName={userContext.fullName} />
      </SidebarProvider>
    </TooltipProvider>
  )
}
