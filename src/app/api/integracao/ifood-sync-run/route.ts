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
import { isApiSyncEnabled } from "@/lib/data/units"
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
    // Disparo manual sempre força (ignora o throttle de 6h) — o operador
    // clicou "Sincronizar agora" de propósito.
    const out = await syncIfoodAll({ force: true, unitIds })
    return Response.json({ ok: true, ...out })
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
