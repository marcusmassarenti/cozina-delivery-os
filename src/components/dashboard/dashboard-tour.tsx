"use client"

import { BarChart3, Filter, Store, Utensils } from "lucide-react"

import { type CoachStep } from "@/components/onboarding/coach-tour"
import { TourButton } from "@/components/onboarding/tour-button"

const STEPS: CoachStep[] = [
  {
    selector: '[data-tour="db-filtros"]',
    icon: <Filter className="size-4" />,
    title: "Filtre a visão",
    body: "Escolha o período, a(s) loja(s) e a plataforma. Tudo abaixo se ajusta ao filtro.",
  },
  {
    selector: '[data-tour="db-kpis"]',
    icon: <BarChart3 className="size-4" />,
    title: "Seus números-chave",
    body: "Faturamento, valor líquido, pedidos, ticket médio, taxa de repasse e avaliações — o resumo da operação.",
  },
  {
    selector: '[data-tour="db-plataformas"]',
    icon: <Utensils className="size-4" />,
    title: "Por plataforma",
    body: "Compare iFood, 99 Food e Keeta lado a lado — quem vende mais, quem cobra mais taxa.",
  },
  {
    selector: '[data-tour="db-lojas"]',
    icon: <Store className="size-4" />,
    title: "Loja por loja",
    body: "Todas as suas unidades com os principais números. Clica numa loja pra ver os detalhes dela.",
  },
]

/** Botão "Como funciona" + tour do Dashboard. */
export function DashboardTour() {
  return <TourButton steps={STEPS} />
}
