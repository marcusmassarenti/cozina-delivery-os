import { Handshake } from "lucide-react"

import { assertCanView, getCurrentHoldingId } from "@/lib/auth/permissions"
import {
  etapasDaAgencia,
  filaDeOnboarding,
  lojasForaDaFila,
} from "@/lib/data/carteira-onboarding"
import { createAdminClient } from "@/lib/supabase/admin"

import { OnboardingView, type Vendedor } from "./_components/onboarding-view"

export const metadata = { title: "Onboarding · Delivery OS" }

/**
 * T5 — a fila entre "vendeu" e "está sendo cuidada".
 *
 * ⚠️ Não confundir com o checklist de "Primeiros passos" do produto: aquele
 * ensina o cliente a usar o sistema, este acompanha a loja da venda até o
 * gestor.
 */
export default async function OnboardingPage() {
  await assertCanView("unidades")
  const [lojas, etapas, vendedores, livres] = await Promise.all([
    filaDeOnboarding(),
    etapasDaAgencia(),
    listarVendedores(),
    lojasForaDaFila(),
  ])

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 bg-muted/30 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Handshake className="size-6 text-muted-foreground" />
          Onboarding
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Quem vendeu, quem alinha e quem vai cuidar — a loja entre a venda e a
          carteira.
        </p>
      </div>

      <OnboardingView
        lojas={lojas}
        etapas={etapas}
        vendedores={vendedores}
        livres={livres}
      />
    </div>
  )
}

async function listarVendedores(): Promise<Vendedor[]> {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return []
  const { data } = await createAdminClient()
    .from("vendedores")
    .select("id, nome")
    .eq("holding_id", holdingId)
    .eq("ativo", true)
    .order("nome")
  return (data ?? []) as Vendedor[]
}
