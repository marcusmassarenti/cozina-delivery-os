import "server-only"

/**
 * "A rotina do dia já terminou?" — o gatilho do relatório de saúde.
 *
 * POR QUE EXISTE: o relatório saía num horário FIXO (11h), e a rotina do dia
 * não termina em horário fixo. Em 15/08/2026 ele disse "o extrato fechou em
 * 70/86 lojas" porque às 11h a coleta ainda estava no meio — os extratos do
 * iFood são assíncronos e só ficaram prontos ao longo da tarde. À noite eram
 * 71 lojas com financeiro do dia.
 *
 * Um relatório de integridade que mede o trabalho pela metade não é
 * conservador, é ERRADO: ele acusa lojas saudáveis e treina quem lê a
 * desconfiar do número. Melhor esperar a rotina fechar e falar uma vez, com o
 * quadro inteiro.
 *
 * ⚠️ MAS NUNCA DEIXA DE FALAR. Se a rotina não fechar — e às vezes não fecha,
 * porque depende da fila do iFood —, o relatório sai assim mesmo na última
 * janela do dia, dizendo que saiu incompleto. Silêncio é a única resposta pior
 * que um número parcial: parece que está tudo bem.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { idsDeUnidadesForaDoSync } from "@/lib/data/unidades-inativas"

export type EstadoDoDia = {
  concluido: boolean
  /** Lojas conectadas que ainda não fecharam o extrato de hoje. */
  faltamExtrato: number
  /** Lojas na fila do backfill de histórico. */
  faltamBackfill: number
}

export async function estadoDoPipeline(): Promise<EstadoDoDia> {
  const admin = createAdminClient()

  const [{ data: vinculos }, foraDoSync] = await Promise.all([
    admin
      .from("unit_platforms")
      .select("unit_id, historico_backfill_at, units!inner(id, active)")
      .eq("platform", "ifood")
      .eq("active", true)
      .not("api_store_id", "is", null),
    idsDeUnidadesForaDoSync(),
  ])

  const lojas = ((vinculos ?? []) as unknown as {
    unit_id: string
    historico_backfill_at: string | null
    units: { id: string; active: boolean }
  }[]).filter((v) => v.units?.active && !foraDoSync.has(v.units.id))

  const faltamBackfill = lojas.filter((l) => !l.historico_backfill_at).length

  // Quem já fechou o extrato HOJE. Mesma leitura barata do coletor: uma linha
  // por importação, não um group-by na tabela de milhões de lançamentos.
  const hoje = new Date()
  const inicio = new Date(
    hoje.getFullYear(),
    hoje.getMonth(),
    hoje.getDate(),
  ).toISOString()
  const { data: fresco } = await admin
    .from("platform_imports")
    .select("unit_id")
    .eq("platform", "ifood")
    .eq("report_type", "financeiro")
    .eq("status", "success")
    .gte("imported_at", inicio)

  const fecharam = new Set(
    ((fresco ?? []) as { unit_id: string }[]).map((r) => r.unit_id),
  )
  const faltamExtrato = lojas.filter((l) => !fecharam.has(l.unit_id)).length

  return {
    concluido: faltamExtrato === 0 && faltamBackfill === 0,
    faltamExtrato,
    faltamBackfill,
  }
}

/** O relatório de saúde já saiu hoje? Evita mandar um por janela. */
export async function saudeJaSaiuHoje(): Promise<boolean> {
  const hoje = new Date()
  const inicio = new Date(
    hoje.getFullYear(),
    hoje.getMonth(),
    hoje.getDate(),
  ).toISOString()
  const { count } = await createAdminClient()
    .from("email_enviados")
    .select("id", { count: "exact", head: true })
    .eq("tipo", "saude-diaria")
    .gte("enviado_em", inicio)
  return (count ?? 0) > 0
}
