import { Store } from "lucide-react"

import { assertCanView } from "@/lib/auth/permissions"
import { listarCarteira } from "@/lib/data/carteira-lojas"

import { LojasView } from "./_components/lojas-view"
import { TourButton } from "@/components/onboarding/tour-button"
import { TOUR_LOJAS } from "../_tours"

export const metadata = { title: "Lista de Lojas · Delivery OS" }

/**
 * A carteira em lista — T2 do painel da agência.
 *
 * NÃO substitui a /unidades. Aquela é a tela de cadastro, que todo cliente
 * usa; esta agrupa por etapa do processo e mostra gestor, promessa e
 * checklist — coisas que só existem pra quem administra carteira.
 */
export default async function CarteiraLojasPage() {
  await assertCanView("unidades")
  const lojas = await listarCarteira()

  return (
    <div className="flex flex-1 flex-col gap-4 bg-muted/30 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Store className="size-6 text-muted-foreground" />
          Lista de Lojas
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Clique na loja para abrir a tela completa e registrar a semana.
        </p>
        <div className="mt-2">
          <TourButton steps={TOUR_LOJAS} />
        </div>
      </div>

      <LojasView lojas={lojas} />
    </div>
  )
}
