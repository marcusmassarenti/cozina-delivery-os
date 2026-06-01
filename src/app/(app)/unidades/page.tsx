import { getVisibleUnits } from "@/lib/data/units"
import { assertCanView } from "@/lib/auth/permissions"
import { UnitsListView } from "./_components/units-list-view"

export default async function UnidadesPage() {
  await assertCanView("unidades")
  const units = await getVisibleUnits()

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <UnitsListView units={units} />
    </div>
  )
}
