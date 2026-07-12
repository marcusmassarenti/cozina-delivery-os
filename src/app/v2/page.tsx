import type { Metadata } from "next"

import { LandingV2 } from "../deliveryos/_landing_v2"

export const metadata: Metadata = {
  title: "Delivery OS — v2 (visão Bruno)",
  robots: { index: false, follow: false }, // variante de teste, fora do Google
}

export default function V2Page() {
  return <LandingV2 />
}
