import { getUnits } from "@/lib/data/units"
import { getRolesConfig } from "@/lib/auth/permissions"
import { createClient } from "@/lib/supabase/server"
import { listUsers } from "./_actions"
import { UsersListView } from "./_components/users-list-view"

export default async function UsuariosPage() {
  const [users, units, roles, supabase] = await Promise.all([
    listUsers(),
    getUnits(),
    getRolesConfig(),
    createClient(),
  ])
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const currentUserId = user?.id ?? null

  const unitOptions = units.map((u) => ({
    id: u.id,
    code: u.code,
    name: u.name,
  }))

  // Perfis vindos da tela de Permissões (banco) — alimentam o dropdown e as abas.
  const roleOptions = roles.map((r) => ({
    key: r.key,
    label: r.label,
    dataScope: r.dataScope,
  }))

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <UsersListView
        users={users}
        currentUserId={currentUserId}
        units={unitOptions}
        roles={roleOptions}
      />
    </div>
  )
}
