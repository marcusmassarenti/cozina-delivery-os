import { assertCanView, isSuperadmin, userCan } from "@/lib/auth/permissions"
import { getCurrentUserContext } from "@/lib/auth/context"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCadastroIncompleto } from "@/lib/data/cadastro-incompleto"
import { getUnitsPage } from "@/lib/data/units-page"
import { filtrosDaUrl } from "@/lib/data/units-page-tipos"
import { CadastroIncompletoAviso } from "./_components/cadastro-incompleto-aviso"
import { UnitsTableView } from "./_components/units-table-view"

/**
 * ⚠️ Esta página deixou de carregar a rede inteira em 16/08/26.
 *
 * Antes: `getVisibleUnits()` trazia TODAS as lojas com os ~25 campos de
 * cadastro E o agregado mensal de cada uma (`getRealMonthlyForUnits`), que a
 * listagem nunca chegou a exibir. Com as 487 lojas do maior cliente isso é
 * meio megabyte e uma agregação inteira por abertura de tela.
 *
 * Agora só a PÁGINA (50 lojas) vem do banco, já filtrada e ordenada lá. Tudo
 * que decora a linha — situação da API do iFood e do 99 — é consultado só pros
 * ids da página, e não mais pra tabela toda.
 */
export default async function UnidadesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await assertCanView("unidades")
  const admin = createAdminClient()
  const filtros = filtrosDaUrl(await searchParams)

  const [pagina, canEdit, canDelete, ctx, superadmin, incompleto] =
    await Promise.all([
      getUnitsPage(filtros),
      userCan("unidades", "edit"),
      userCan("unidades", "delete"),
      getCurrentUserContext(),
      isSuperadmin(),
      getCadastroIncompleto(),
    ])

  const ids = pagina.linhas.map((u) => u.id)
  const semIds = ids.length === 0

  // Situação das APIs, só das lojas que estão na tela. Estas três consultas
  // varriam as tabelas inteiras (sem filtro de unidade nenhum) — o que era
  // barato com 16 lojas e passaria a trazer a base toda de todos os clientes.
  const [upIfood, reqs, links, reqs99] = await Promise.all([
    semIds
      ? { data: [] }
      : admin
          .from("unit_platforms")
          .select("unit_id, api_store_id")
          .eq("platform", "ifood")
          .eq("active", true)
          .not("api_store_id", "is", null)
          .in("unit_id", ids),
    semIds
      ? { data: [] }
      : admin
          .from("ifood_activation_requests")
          .select("unit_id, status, created_at")
          .in("status", ["pendente", "solicitada"])
          .in("unit_id", ids)
          .order("created_at", { ascending: false }),
    semIds
      ? { data: [] }
      : admin
          .from("ninefood_store_links")
          .select("unit_id")
          .eq("active", true)
          .in("unit_id", ids),
    semIds
      ? { data: [] }
      : admin
          .from("ninefood_activation_requests")
          .select("unit_id, status, created_at")
          .in("status", ["pendente", "solicitada"])
          .in("unit_id", ids)
          .order("created_at", { ascending: false }),
  ])

  // Vinculada > solicitação em aberto. O "disponivel" a tela deriva sozinha
  // (loja com a plataforma ativa e sem nada disso).
  const ifoodApiPorUnidade: Record<string, "conectada" | "andamento"> = {}
  for (const r of (reqs.data ?? []) as { unit_id: string | null }[]) {
    if (r.unit_id && !ifoodApiPorUnidade[r.unit_id])
      ifoodApiPorUnidade[r.unit_id] = "andamento"
  }
  for (const r of (upIfood.data ?? []) as { unit_id: string }[]) {
    ifoodApiPorUnidade[r.unit_id] = "conectada"
  }

  const nineApiPorUnidade: Record<string, "conectada" | "andamento"> = {}
  for (const r of (reqs99.data ?? []) as { unit_id: string | null }[]) {
    if (r.unit_id && !nineApiPorUnidade[r.unit_id])
      nineApiPorUnidade[r.unit_id] = "andamento"
  }
  for (const r of (links.data ?? []) as { unit_id: string | null }[]) {
    if (r.unit_id) nineApiPorUnidade[r.unit_id] = "conectada"
  }

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      {/* Permanente aqui: é a tela onde o problema se resolve, e aviso que se
          fecha some justamente de quem tinha como agir. */}
      <CadastroIncompletoAviso
        dados={incompleto}
        permanente
        semCnpj={incompleto.semCnpj}
      />
      <UnitsTableView
        pagina={pagina}
        filtros={filtros}
        canEdit={canEdit}
        canDelete={canDelete}
        brandLogoUrl={ctx.logoUrl}
        cadastroExigente={!superadmin}
        ifoodApiPorUnidade={ifoodApiPorUnidade}
        nineApiPorUnidade={nineApiPorUnidade}
      />
    </div>
  )
}
