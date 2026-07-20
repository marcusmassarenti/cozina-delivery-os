"use client"

import * as React from "react"

/**
 * Preferências de visibilidade das seções do Dashboard.
 *
 * Salvo em localStorage (`dashboard.sections.visible`). Mudanças disparam
 * um CustomEvent `dashboard-prefs-change` no window pra outros componentes
 * (topbar + page) ficarem em sync sem precisar de Context.
 */

const STORAGE_KEY = "dashboard.sections.visible"
const EVENT_NAME = "dashboard-prefs-change"

export type SectionId =
  | "atencao"
  | "kpis"
  | "plataformas"
  | "cardapio"
  | "satisfacao"
  | "unidades"

export const SECTION_META: Record<
  SectionId,
  { label: string; description: string; number?: number }
> = {
  atencao: {
    label: "Precisa de atenção",
    description: "Lojas com sinal de problema no mês (faturamento, nota, CMV…)",
  },
  kpis: {
    number: 1,
    label: "Performance da Operação",
    description: "KPIs, evolução no tempo e pra onde vai o bruto",
  },
  plataformas: {
    number: 2,
    label: "Visão por Plataforma",
    description: "iFood, 99 Food, Keeta — barrinhas comparativas",
  },
  cardapio: {
    number: 3,
    label: "Cardápio & Cancelamentos",
    description: "Funil, top cancelamentos e top produtos",
  },
  satisfacao: {
    number: 4,
    label: "Satisfação dos Clientes",
    description: "Notas, elogios e reclamações",
  },
  unidades: {
    number: 5,
    label: "Detalhamento por Unidade",
    description: "Ranking de lojas com detalhe e margem por loja",
  },
}

export const SECTION_ORDER: SectionId[] = [
  "atencao",
  "kpis",
  "plataformas",
  "cardapio",
  "satisfacao",
  "unidades",
]

const DEFAULTS: Record<SectionId, boolean> = {
  atencao: true,
  kpis: true,
  plataformas: true,
  cardapio: true,
  satisfacao: true,
  unidades: true,
}

function readPrefs(): Record<SectionId, boolean> {
  if (typeof window === "undefined") return DEFAULTS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw)
    return { ...DEFAULTS, ...parsed }
  } catch {
    return DEFAULTS
  }
}

function writePrefs(prefs: Record<SectionId, boolean>) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  window.dispatchEvent(new CustomEvent(EVENT_NAME))
}

export function useDashboardPrefs() {
  const [prefs, setPrefs] = React.useState<Record<SectionId, boolean>>(DEFAULTS)
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    setPrefs(readPrefs())
    setReady(true)
    const handler = () => setPrefs(readPrefs())
    window.addEventListener(EVENT_NAME, handler)
    // Sync entre abas
    const storageHandler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setPrefs(readPrefs())
    }
    window.addEventListener("storage", storageHandler)
    return () => {
      window.removeEventListener(EVENT_NAME, handler)
      window.removeEventListener("storage", storageHandler)
    }
  }, [])

  const toggle = React.useCallback((id: SectionId) => {
    const current = readPrefs()
    writePrefs({ ...current, [id]: !current[id] })
  }, [])

  const resetAll = React.useCallback(() => {
    writePrefs(DEFAULTS)
  }, [])

  return { prefs, toggle, resetAll, ready }
}
