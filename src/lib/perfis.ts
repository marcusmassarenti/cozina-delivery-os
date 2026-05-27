/**
 * Perfis (departamentos) disponíveis para usuários do sistema.
 * Cada perfil tem uma cor associada pra badges.
 */

export type PerfilId =
  | "administrador"
  | "producao"
  | "eventos"
  | "financeiro"
  | "logistica"
  | "comercial"
  | "viewer"

type PerfilConfig = {
  id: PerfilId
  label: string
  badge: string
}

export const PERFIS: PerfilConfig[] = [
  {
    id: "administrador",
    label: "Administrador",
    badge:
      "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  },
  {
    id: "producao",
    label: "Produção",
    badge:
      "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  },
  {
    id: "eventos",
    label: "Eventos",
    badge:
      "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
  },
  {
    id: "financeiro",
    label: "Financeiro",
    badge:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  {
    id: "logistica",
    label: "Logística",
    badge:
      "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  },
  {
    id: "comercial",
    label: "Comercial",
    badge:
      "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  },
  {
    id: "viewer",
    label: "Viewer",
    badge:
      "bg-muted text-muted-foreground",
  },
]

export function perfilLabel(id: string): string {
  return PERFIS.find((p) => p.id === id)?.label ?? id
}

export function perfilBadge(id: string): string {
  return (
    PERFIS.find((p) => p.id === id)?.badge ?? "bg-muted text-muted-foreground"
  )
}
