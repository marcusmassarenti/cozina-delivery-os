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
import {
  getAccessibleUnitIds,
  getVerComoHoldingId,
  isSuperadmin,
  userCan,
} from "@/lib/auth/permissions"
import { createAdminClient } from "@/lib/supabase/admin"
import { isApiSyncEnabled } from "@/lib/data/units"
import { autoLinkIfoodMerchants } from "@/lib/ifood/auto-link"
import { syncIfoodAll } from "@/lib/ifood/sync"
import { pegarTrava } from "@/lib/sync-lock"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(req: Request) {
  if (!(await userCan("dashboard", "view"))) {
    return new Response("Unauthorized", { status: 401 })
  }

  /* `todos: true` → base INTEIRA, ignorando o escopo do usuário.
   *
   * É o botão da tela de merchants (dono). Sem isto ele rodava só as 14 lojas
   * da empresa do Marcus — ele é superadmin COM empresa, então o escopo normal
   * o prende ao próprio tenant, que é justamente o isolamento que a gente quer
   * em toda tela de operação.
   *
   * Só superadmin: qualquer outro pedindo `todos` é ignorado e cai no escopo
   * dele. Nunca dá erro — só não amplia.
   *
   * Vale pras lojas que ele vincular DEPOIS também: o alcance é "todas com
   * merchant", resolvido a cada chamada, não uma lista fixa. */
  let todos = false
  try {
    const body = (await req.json()) as { todos?: boolean } | null
    todos = Boolean(body?.todos) && (await isSuperadmin())
  } catch {
    todos = false
  }
  if (!(await isApiSyncEnabled())) {
    return Response.json(
      { ok: false, error: "Sync via API não habilitado para esta conta." },
      { status: 403 },
    )
  }

  // null = base inteira. Ou porque o dono pediu `todos`, ou porque é admin de
  // plataforma sem empresa nenhuma.
  const unitIds = todos ? null : await getAccessibleUnitIds()

  /* Diagnóstico do ZERO.
   *
   * "0 loja(s)" sem motivo é o pior retorno possível: o cliente vê a conexão
   * ativa na tela e o sync dizendo que não há nada, e ninguém sabe se é
   * escopo, vínculo ou permissão. Aconteceu com a Vbfood em 07/ago — banco
   * impecável (holding com api_sync_enabled, loja ativa, api_store_id
   * preenchido) e o botão devolvendo zero, sem pista pra investigar.
   *
   * Custa uma contagem, e só quando o resultado é vazio. */
  if (unitIds !== null && unitIds.length === 0) {
    return Response.json({
      ok: true,
      ranAt: new Date().toISOString(),
      unitsProcessed: 0,
      results: [],
      /* Diagnóstico COM OS VALORES. A frase genérica não bastou: o banco
       * estava certo e o escopo voltava vazio mesmo assim. Sem saber QUAL
       * holding o "ver como" resolveu e quantas marcas/lojas ela tem, a
       * investigação vira chute — foram três rodadas até aqui. */
      diagnostico: await (async () => {
        const verComo = await getVerComoHoldingId()
        if (!verComo) {
          return "Nenhuma loja no seu acesso, e não há visão-como-cliente ativa nesta requisição. Se a faixa vermelha está na tela, o cookie não chegou nesta rota."
        }
        const admin = createAdminClient()
        const { data: h } = await admin
          .from("holdings")
          .select("name")
          .eq("id", verComo)
          .maybeSingle()
        const { count: marcas } = await admin
          .from("brands")
          .select("id", { count: "exact", head: true })
          .eq("holding_id", verComo)
        return `Vendo como "${(h as { name?: string } | null)?.name ?? "(empresa não encontrada)"}" (id ${verComo.slice(0, 8)}…): ${marcas ?? 0} marca(s), 0 loja(s) no escopo.`
      })(),
    })
  }
  if (unitIds !== null) {
    const admin = createAdminClient()
    const { count: comMerchant } = await admin
      .from("unit_platforms")
      .select("unit_id", { count: "exact", head: true })
      .eq("platform", "ifood")
      .eq("active", true)
      .not("api_store_id", "is", null)
      .in("unit_id", unitIds)
    if (!comMerchant) {
      return Response.json({
        ok: true,
        ranAt: new Date().toISOString(),
        unitsProcessed: 0,
        results: [],
        diagnostico: `${unitIds.length} loja(s) no seu acesso, nenhuma com merchant do iFood vinculado. Vincule em Integrações › Conexões.`,
      })
    }
  }

  /* Uma execução por vez. Ver @/lib/sync-lock: no celular o navegador desiste
   * antes do servidor, e quem vê "Load failed" clica de novo — cada clique
   * abre outra varredura da base inteira por cima da anterior. */
  const trava = await pegarTrava(
    todos ? "ifood-sync-todos" : "ifood-sync",
    "botao",
  )
  if (!trava.pegou) {
    return Response.json({
      ok: false,
      error: `Já tem uma sincronização rodando (começou há ${
        trava.desdeMin < 1 ? "menos de um minuto" : `${trava.desdeMin} min`
      }). Espere ela terminar — rodar duas ao mesmo tempo deixa a plataforma inteira lenta.`,
    })
  }

  try {
    // Antes do sync: só CASA lojas recém-autorizadas do escopo (rápido — o
    // botão precisa responder em segundos). O backfill do histórico (pesado,
    // ~2min/loja) fica pro cron diário via autoLinkAndBackfill — rodar aqui
    // estourava o timeout (300s) e devolvia página de erro não-JSON.
    // A loja recém-vinculada já pega mês corrente + anterior no sync abaixo.
    let autoLink: Awaited<ReturnType<typeof autoLinkIfoodMerchants>> | null =
      null
    try {
      autoLink = await autoLinkIfoodMerchants(unitIds)
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
  } finally {
    await trava.liberar()
  }
}
