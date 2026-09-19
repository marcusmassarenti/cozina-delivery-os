import { notFound } from "next/navigation"

import {
  MODULES,
  getRolesConfig,
  isSuperadmin,
} from "@/lib/auth/permissions"
import { PermissionsManager } from "./_components/permissions-manager"

export default async function PermissoesPage() {
  // Só o super-admin: os perfis valem pra TODOS os clientes — ver o aviso em
  // `_actions.ts`. Pra quem não é, a tela não existe (404), igual à aba.
  if (!(await isSuperadmin())) notFound()

  const roles = await getRolesConfig()

  // MODULES é `as const` (readonly) — serializa pra plain antes de cruzar pro client.
  const modules = MODULES.map((m) => ({
    key: m.key,
    label: m.label,
    actions: [...m.actions] as ("view" | "edit" | "delete")[],
  }))

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <PermissionsManager roles={roles} modules={modules} />
    </div>
  )
}
