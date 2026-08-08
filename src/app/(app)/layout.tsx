import { ConviteInstalar } from "@/components/pwa/convite-instalar"
import { redirect } from "next/navigation"
import { after } from "next/server"

import { AppSidebar } from "@/components/app-sidebar"
import { NavigationProgress } from "@/components/shared/navigation-progress"
import { TopBar } from "@/components/top-bar"
import { VerComoFaixa } from "@/components/ver-como-faixa"
import { WelcomeTour } from "@/components/onboarding/welcome-tour"
import { WelcomeSubscribedModal } from "@/components/welcome-subscribed-modal"
import { WhatsNewModal } from "@/components/whats-new-modal"
import { SaudeSemanalModal } from "@/components/saude-semanal-modal"
import { NinoCortesiaModal } from "@/components/nino-cortesia-modal"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getCurrentUserContext } from "@/lib/auth/context"
import { getMfaStatus } from "@/lib/auth/mfa"
import {
  MODULES,
  userCan,
  isSuperadmin,
  getCurrentHoldingId,
  getVerComoHoldingId,
} from "@/lib/auth/permissions"
import {
  getAvisoSemanalSaude,
  semanaIso,
  semanaVistaPeloUsuario,
} from "@/lib/data/aviso-semanal-saude"
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

  // "Último acesso" real: marca atividade (throttle de 5 min no RPC).
  //
  // ⚠️ Tem que ser AGUARDADO. No supabase-js a requisição só é montada dentro
  // do `then()` — o objeto devolvido por .rpc() é preguiçoso, não é uma
  // Promise já em andamento. O `void supabase.rpc(...)` que estava aqui nunca
  // chegou a fazer chamada nenhuma: eram 18 usuários e ZERO com last_seen_at,
  // e a tela caía calada no último login. Quem já estava logado aparecia como
  // sumido há dias.
  //
  // Vai dentro de `after` pra continuar não segurando o render.
  after(async () => {
    const { error } = await supabase.rpc("touch_last_seen")
    if (error) console.error("touch_last_seen:", error.message)
  })

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
  const verComoId = await getVerComoHoldingId()

  /* Aviso semanal de saúde das lojas — 1x por semana, a partir da segunda.
   *
   * ⚠️ A ORDEM AQUI É O QUE IMPORTA. `getAvisoSemanalSaude()` roda o
   * diagnóstico inteiro das integrações; se ficasse solto, rodaria em TODO
   * carregamento de TODA tela do app. Então primeiro vem a consulta barata
   * ("que semana este usuário já viu?") e só quando ela diz que falta é que o
   * diagnóstico acontece — ou seja, uma vez por semana por pessoa.
   *
   * Durante o "ver como o cliente" não aparece: aquele modo é somente-leitura,
   * a ação de marcar como visto seria bloqueada, e o pop-up voltaria a cada
   * clique sem jeito de fechar. */
  const semanaAtual = semanaIso()
  const jaViu =
    verComoId !== null || (await semanaVistaPeloUsuario(data.user.id)) === semanaAtual
  const avisoSaude = jaViu ? null : await getAvisoSemanalSaude()

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
            verComo={verComoId !== null}
          />
          {/* Vem PRIMEIRO, acima de cobrança e trial: saber de quem é o dado
              na tela precede qualquer outro aviso. */}
          <VerComoFaixa />
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
          <NavigationProgress>
            {/* Só aparece no celular, e só pra quem ainda não instalou. */}
            <ConviteInstalar />
            {children}
          </NavigationProgress>
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
        <SaudeSemanalModal aviso={avisoSaude} />
      </SidebarProvider>
    </TooltipProvider>
  )
}
