/**
 * Envelope de execução de cron.
 *
 * Todo cron passa por aqui pra deixar rastro em `cron_runs`. O motivo é
 * simples: "o cron rodou e não achou nada" e "o cron não rodou" produzem
 * exatamente o mesmo silêncio no banco — e a segunda situação é a que
 * machuca, porque a plataforma pode ficar uma semana sem sincronizar sem
 * nenhum sinal.
 *
 * Nunca altera o comportamento do cron: se o registro falhar, o trabalho
 * segue. Monitoramento que derruba o que monitora é pior que não ter.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export type NomeCron =
  | "ifood-sync"
  | "ifood-review-sync"
  | "ifood-auto-vincular"
  | "ifood-backfill"
  | "ninefood-sync"
  | "cardapioweb-sync"
  | "process-99-webhooks"
  | "billing-vencimentos"
  | "emitir-faturas"
  | "regua-email"
  | "saude-diaria"
  | "resumo-semanal"

/**
 * Roda o cron registrando início e fim. O sucesso é lido do STATUS da
 * resposta — não de "não estourou exceção". Vários crons capturam o próprio
 * erro e devolvem 500 com uma mensagem; sem olhar o status, esses apareceriam
 * como bem-sucedidos, que é o pior tipo de monitoramento: o que mente.
 */
export async function registrarCron(
  nome: NomeCron,
  trabalho: () => Promise<Response>,
): Promise<Response> {
  const admin = createAdminClient()
  const t0 = Date.now()

  let runId: string | null = null
  try {
    const { data } = await admin
      .from("cron_runs")
      .insert({ nome })
      .select("id")
      .maybeSingle()
    runId = (data?.id as string) ?? null
  } catch {
    // segue sem registro
  }

  const fechar = async (ok: boolean, erro?: string, resumo?: Record<string, unknown>) => {
    if (!runId) return
    try {
      await admin
        .from("cron_runs")
        .update({
          terminado_em: new Date().toISOString(),
          ok,
          duracao_ms: Date.now() - t0,
          erro: erro ?? null,
          resumo: resumo ?? null,
        })
        .eq("id", runId)
    } catch {
      // idem
    }
  }

  try {
    const res = await trabalho()

    // Clona antes de ler: o corpo de uma Response só pode ser consumido uma
    // vez, e quem vai consumir de verdade é a Vercel.
    let resumo: Record<string, unknown> | undefined
    try {
      const corpo = await res.clone().json()
      if (corpo && typeof corpo === "object") resumo = corpo as Record<string, unknown>
    } catch {
      // resposta sem JSON — tudo bem, o status já diz o essencial
    }

    await fechar(res.ok, res.ok ? undefined : `HTTP ${res.status}`, resumo)
    return res
  } catch (e) {
    // Registra a falha e RELANÇA: quem chamou decide o que responder. Engolir
    // o erro aqui faria o cron parecer bem-sucedido pra Vercel.
    await fechar(false, e instanceof Error ? e.message : String(e))
    throw e
  }
}
