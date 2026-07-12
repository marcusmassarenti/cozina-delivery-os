import type { Metadata } from "next"

import { LandingV3 } from "../deliveryos/_landing_v3"

export const metadata: Metadata = {
  title: "Delivery OS — v3 (visão agentes)",
  robots: { index: false, follow: false }, // variante de teste, fora do Google
}

export default function V3Page() {
  return <LandingV3 />
}
