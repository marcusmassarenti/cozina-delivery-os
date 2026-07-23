/**
 * Dispara manualmente o sync iFood — ESCOPADO ao tenant de quem clicou.
 *
 * Diferente do cron (que roda a rede toda, porque é nosso), o botão
 * "Sincronizar iFood" só processa as lojas que o usuário enxerga
 * (getAccessibleUnitIds). Antes ele rodava global: qualquer usuário logado
 * disparava o sync de TODOS os tenants e a resposta devolvia nome/código
 * das lojas dos outros — vazamento de metadado + queima de rate limit.
 *
 * Guardas:
 *  1. login com acesso ao dashboard
 *  2. holding com `api_sync_enabled` (a mesma flag que mostra o botão)
 *  3. unidades restritas às do usuário
 */
import { getAccessibleUnitIds, userCan } from "@/lib/auth/permissions"
import { createAdminClient } from "@/lib/supabase/admin"
import { isApiSyncEnabled } from "@/lib/data/units"
import { autoLinkAndBackfill } from "@/lib/ifood/auto-link"
import { syncIfoodAll } from "@/lib/ifood/sync"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST() {
  if (!(await userCan("dashboard", "view"))) {
    return new Response("Unauthorized", { status: 401 })
  }
  if (!(await isApiSyncEnabled())) {
    return Response.json(
      { ok: false, error: "Sync via API não habilitado para esta conta." },
      { status: 403 },
    )
  }

  // null = admin de plataforma sem empresa (vê tudo) — mantém global.
  const unitIds = await getAccessibleUnitIds()
  if (unitIds !== null && unitIds.length === 0) {
    return Response.json({
      ok: true,
      ranAt: new Date().toISOString(),
      unitsProcessed: 0,
      results: [],
    })
  }

  try {
    // Antes do sync: casa lojas recém-autorizadas do escopo do usuário (por
    // CNPJ) e puxa o histórico delas — quem clica já vê a loja nova entrar.
    let autoLink: Awaited<ReturnType<typeof autoLinkAndBackfill>> | null = null
    try {
      autoLink = await autoLinkAndBackfill(unitIds)
    } catch {
      autoLink = null
    }

    // Disparo manual sempre força (ignora o throttle de 6h) — o operador
    // clicou "Sincronizar agora" de propósito.
    const out = await syncIfoodAll({ force: true, unitIds })

    // Lojas do usuário com iFood ativo mas SEM vínculo com a API — o dialog
    // avisa por que elas não entraram no sync (senão parece que "faltou").
    let semVinculo: string[] = []
    if (unitIds !== null) {
      const admin = createAdminClient()
      const { data } = await admin
        .from("unit_platforms")
        .select("units!inner(name, active)")
        .eq("platform", "ifood")
        .eq("active", true)
        .is("api_store_id", null)
        .in("unit_id", unitIds)
      semVinculo = ((data ?? []) as unknown as {
        units: { name: string; active: boolean }
      }[])
        .filter((r) => r.units.active)
        .map((r) => r.units.name)
        .sort((a, b) => a.localeCompare(b, "pt-BR"))
    }
    return Response.json({ ok: true, semVinculo, autoLink, ...out })
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
