/**
 * Dispara manualmente o sync iFood (mesma lógica do cron diário).
 *
 * Útil pra testar a integração sob demanda sem precisar do CRON_SECRET —
 * liberado pra qualquer usuário que vê o dashboard (mesmo nível do botão
 * "Sincronizar 99"); exige login, não é público.
 *
 * NÃO substitui o cron — o cron continua rodando às 06h BRT via vercel.json.
 */
import { userCan } from "@/lib/auth/permissions"
import { syncIfoodAll } from "@/lib/ifood/sync"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST() {
  if (!(await userCan("dashboard", "view"))) {
    return new Response("Unauthorized", { status: 401 })
  }
  try {
    // Disparo manual sempre força (ignora o throttle de 6h) — o operador
    // clicou "Sincronizar agora" de propósito.
    const out = await syncIfoodAll({ force: true })
    return Response.json({ ok: true, ...out })
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
