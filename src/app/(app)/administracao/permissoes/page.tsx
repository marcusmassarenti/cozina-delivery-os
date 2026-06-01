import { notFound } from "next/navigation"

import {
  MODULES,
  getRolesConfig,
  userCan,
} from "@/lib/auth/permissions"
import { PermissionsManager } from "./_components/permissions-manager"

export default async function PermissoesPage() {
  // Gate de página: só quem gere usuários/acessos vê isto.
  if (!(await userCan("usuarios", "edit"))) notFound()

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
