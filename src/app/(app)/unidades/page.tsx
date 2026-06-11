import { getVisibleUnits } from "@/lib/data/units"
import { assertCanView, userCan } from "@/lib/auth/permissions"
import { createAdminClient } from "@/lib/supabase/admin"
import { UnitsListView } from "./_components/units-list-view"

export default async function UnidadesPage() {
  await assertCanView("unidades")
  const admin = createAdminClient()
  const [units, canEdit, canDelete, links] = await Promise.all([
    getVisibleUnits(),
    userCan("unidades", "edit"),
    userCan("unidades", "delete"),
    admin.from("ninefood_store_links").select("unit_id").eq("active", true),
  ])
  // unidades que sincronizam financeiro/cardápio pela API do 99
  const ninefoodSyncedIds = ((links.data ?? []) as { unit_id: string | null }[])
    .map((r) => r.unit_id)
    .filter((id): id is string => !!id)

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <UnitsListView
        units={units}
        canEdit={canEdit}
        canDelete={canDelete}
        ninefoodSyncedIds={ninefoodSyncedIds}
      />
    </div>
  )
}
