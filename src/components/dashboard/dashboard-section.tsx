"use client"

import * as React from "react"

import {
  useDashboardPrefs,
  type SectionId,
} from "@/lib/hooks/use-dashboard-prefs"

/**
 * Esconde toda a árvore de filhos quando a seção está desligada no popover
 * de customizar. Usa hook `useDashboardPrefs` que lê localStorage.
 *
 * Importante: renderiza filhos por padrão até hidratar (evita flash de
 * seção sumindo quando o user nunca tocou no popover).
 */
export function DashboardSection({
  id,
  children,
}: {
  id: SectionId
  children: React.ReactNode
}) {
  const { prefs, ready } = useDashboardPrefs()
  if (ready && !prefs[id]) return null
  return <>{children}</>
}
