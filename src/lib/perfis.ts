/**
 * Perfis de acesso disponíveis para usuários do sistema.
 *
 * - administrador: equipe interna da Cozina Foods. Acesso holding-wide.
 *   Mapeado pra user_unit_access(scope_type='holding', scope_id=cozina).
 * - franqueado: cliente dono de uma unidade. Acesso restrito a 1 loja.
 *   Mapeado pra user_unit_access(scope_type='unit', scope_id=unit_id).
 */

export type PerfilId = "administrador" | "franqueado"

type PerfilConfig = {
  id: PerfilId
  label: string
  badge: string
  requiresUnit: boolean
}

export const PERFIS: PerfilConfig[] = [
  {
    id: "administrador",
    label: "Administrador",
    badge:
      "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    requiresUnit: false,
  },
  {
    id: "franqueado",
    label: "Franqueado",
    badge:
      "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    requiresUnit: true,
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

export function perfilRequiresUnit(id: string): boolean {
  return PERFIS.find((p) => p.id === id)?.requiresUnit ?? false
}
