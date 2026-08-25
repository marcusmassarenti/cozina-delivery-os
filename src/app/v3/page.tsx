import type { Metadata } from "next"

import { getDefaultPlan } from "@/lib/data/assinatura"
import { getLandingNumeros } from "@/lib/data/landing-numeros"
import { LandingV3 } from "../deliveryos/_landing_v3"

export const metadata: Metadata = {
  title: "Delivery OS — v3 (visão agentes)",
  robots: { index: false, follow: false }, // variante de teste, fora do Google
}

export default async function V3Page() {
  const [precos, numeros] = await Promise.all([
    getDefaultPlan(),
    getLandingNumeros(),
  ])
  return <LandingV3 precos={precos} numeros={numeros} />
}
