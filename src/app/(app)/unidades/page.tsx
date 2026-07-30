import { getVisibleUnits } from "@/lib/data/units"
import { assertCanView, isSuperadmin, userCan } from "@/lib/auth/permissions"
import { getCurrentUserContext } from "@/lib/auth/context"
import { createAdminClient } from "@/lib/supabase/admin"
import { AvisoSemCnpj } from "@/components/unidades/aviso-sem-cnpj"
import { UnitsListView } from "./_components/units-list-view"

export default async function UnidadesPage() {
  await assertCanView("unidades")
  const admin = createAdminClient()
  const [units, canEdit, canDelete, links, ctx, superadmin, upIfood, reqs] =
    await Promise.all([
      getVisibleUnits(),
      userCan("unidades", "edit"),
      userCan("unidades", "delete"),
      admin.from("ninefood_store_links").select("unit_id").eq("active", true),
      getCurrentUserContext(),
      isSuperadmin(),
      admin
        .from("unit_platforms")
        .select("unit_id, api_store_id")
        .eq("platform", "ifood")
        .eq("active", true)
        .not("api_store_id", "is", null),
      admin
        .from("ifood_activation_requests")
        .select("unit_id, status, created_at")
        .in("status", ["pendente", "solicitada"])
        .order("created_at", { ascending: false }),
    ])
  // unidades que sincronizam financeiro/cardápio pela API do 99
  const ninefoodSyncedIds = ((links.data ?? []) as { unit_id: string | null }[])
    .map((r) => r.unit_id)
    .filter((id): id is string => !!id)

  // Situação iFood-via-API por unidade (pro bloco dentro do Editar):
  // vinculada > solicitação em aberto. O "disponivel" o view deriva sozinho
  // (unidade com iFood ativo e sem nada disso).
  const ifoodApiPorUnidade: Record<string, "conectada" | "andamento"> = {}
  for (const r of (reqs.data ?? []) as { unit_id: string | null }[]) {
    if (r.unit_id && !ifoodApiPorUnidade[r.unit_id])
      ifoodApiPorUnidade[r.unit_id] = "andamento"
  }
  for (const r of (upIfood.data ?? []) as { unit_id: string }[]) {
    ifoodApiPorUnidade[r.unit_id] = "conectada"
  }

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <AvisoSemCnpj
        unidades={units
          .filter((u) => !u.cnpj || u.cnpj.replace(/\D/g, "").length !== 14)
          .map((u) => ({ code: u.code, name: u.name }))}
      />
      <UnitsListView
        units={units}
        canEdit={canEdit}
        canDelete={canDelete}
        ninefoodSyncedIds={ninefoodSyncedIds}
        brandLogoUrl={ctx.logoUrl}
        cadastroExigente={!superadmin}
        ifoodApiPorUnidade={ifoodApiPorUnidade}
      />
    </div>
  )
}
