import { createClient } from "@/lib/supabase/server"
import { listUsers } from "./_actions"
import { UsersListView } from "./_components/users-list-view"

export default async function UsuariosPage() {
  const users = await listUsers()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const currentUserId = user?.id ?? null

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <UsersListView users={users} currentUserId={currentUserId} />
    </div>
  )
}
