import { getUnits } from "@/lib/data/units"
import { createClient } from "@/lib/supabase/server"
import { listUsers } from "./_actions"
import { UsersListView } from "./_components/users-list-view"

export default async function UsuariosPage() {
  const [users, units, supabase] = await Promise.all([
    listUsers(),
    getUnits(),
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

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <UsersListView
        users={users}
        currentUserId={currentUserId}
        units={unitOptions}
      />
    </div>
  )
}
