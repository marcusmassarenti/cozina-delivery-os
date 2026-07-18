import { Sparkles } from "lucide-react"

import { getCurrentHoldingBilling } from "@/lib/data/billing"
import { isSuperadmin } from "@/lib/auth/permissions"
import { ContaTabs } from "./_components/conta-tabs"

const PLAN_LABEL: Record<string, string> = {
  essencial: "Essencial",
  pro: "Pro",
  ai: "DeliveryOS AI",
}

/**
 * Central "Minha conta": dados cadastrais, personalização, assinatura e
 * acessos (permissões/usuários) num lugar só, em abas.
 */
export default async function MinhaContaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [billing, superadmin] = await Promise.all([
    getCurrentHoldingBilling(),
    isSuperadmin(),
  ])
  // Super-admin (dono) roda no topo → DeliveryOS AI.
  const tier = superadmin ? "ai" : (billing?.planTier ?? null)
  const label = tier ? PLAN_LABEL[tier] : null
  const isAi = tier === "ai"

  return (
    <div className="flex flex-1 flex-col bg-muted/30">
      <div className="border-b bg-background px-6 pt-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight">Minha conta</h1>
          {label && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                isAi
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {isAi && <Sparkles className="size-3.5" />}
              {label}
            </span>
          )}
        </div>
        <ContaTabs />
      </div>
      {children}
    </div>
  )
}
