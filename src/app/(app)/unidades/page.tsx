import { getVisibleUnits } from "@/lib/data/units"
import { UnitsListView } from "./_components/units-list-view"

export default async function UnidadesPage() {
  const units = await getVisibleUnits()

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <UnitsListView units={units} />
    </div>
  )
}
