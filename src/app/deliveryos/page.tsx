import type { Metadata } from "next"

import { Landing } from "./_landing"

export const metadata: Metadata = {
  title: "Delivery OS — veja quanto você realmente ganha no delivery",
  description:
    "O Delivery OS lê os relatórios do iFood, 99 e Keeta e mostra faturamento, taxas, repasses e lucro de cada loja num painel só. Você sobe a planilha, a gente faz a conta.",
}

export default function DeliveryOsLandingPage() {
  return <Landing />
}
