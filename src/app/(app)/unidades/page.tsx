import { getVisibleUnits } from "@/lib/data/units"
import { assertCanView, userCan } from "@/lib/auth/permissions"
import { UnitsListView } from "./_components/units-list-view"

export default async function UnidadesPage() {
  await assertCanView("unidades")
  const [units, canEdit, canDelete] = await Promise.all([
    getVisibleUnits(),
    userCan("unidades", "edit"),
    userCan("unidades", "delete"),
  ])

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <UnitsListView units={units} canEdit={canEdit} canDelete={canDelete} />
    </div>
  )
}
