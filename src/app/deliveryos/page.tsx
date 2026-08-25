import type { Metadata } from "next"

import { getDefaultPlan } from "@/lib/data/assinatura"
import { LandingV3 } from "./_landing_v3"

const TITLE = "Delivery OS — veja quanto você realmente ganha no delivery"
/**
 * ⚠️ Terminava com "Você sobe a planilha, a gente faz a conta" — a promessa da
 * primeira versão, de quando tudo era importação. Hoje o iFood, a 99 e o
 * Cardápio Web entram sozinhos depois que o lojista autoriza no portal deles,
 * e essa frase era a que aparecia no Google e no compartilhamento de link.
 */
const DESCRIPTION =
  "O Delivery OS conecta iFood, 99 Food e Cardápio Web e mostra faturamento, taxas, repasses e lucro de cada loja num painel só — sem senha, você autoriza no portal da plataforma. O que não vem por integração entra por planilha. E o DeliveryOS AI diagnostica cada loja e escreve o plano de ação do mês."

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

export default async function DeliveryOsLandingPage() {
  // Preços vêm do /plataforma (platform_settings) — landing e checkout sempre
  // iguais. Muda num lugar só.
  const precos = await getDefaultPlan()
  return <LandingV3 precos={precos} />
}
