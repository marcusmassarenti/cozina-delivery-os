import type { Metadata } from "next"

import { LandingV3 } from "./_landing_v3"

const TITLE = "Delivery OS — veja quanto você realmente ganha no delivery"
const DESCRIPTION =
  "O Delivery OS lê os relatórios do iFood, 99 e Keeta e mostra faturamento, taxas, repasses e lucro de cada loja num painel só. E o DeliveryOS AI diagnostica cada loja e escreve o plano de ação do mês. Você sobe a planilha, a gente faz a conta."

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    url: "https://www.deliveryos.food",
    siteName: "Delivery OS",
    title: TITLE,
    description: DESCRIPTION,
    locale: "pt_BR",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Delivery OS — descubra quanto você realmente ganha em cada plataforma",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og.png"],
  },
}

export default function DeliveryOsLandingPage() {
  return <LandingV3 />
}
