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
import { inicioDoDiaBR } from "@/lib/dia-br"

export type EstadoDoDia = {
  concluido: boolean
  /** Lojas que ainda PODEM fechar o extrato hoje e não fecharam. */
  faltamExtrato: number
  /** Lojas na fila do backfill de histórico. */
  faltamBackfill: number
  /**
   * Lojas que o iFood está NEGANDO (403) — não fecham hoje nem nunca, até
   * alguém reautorizar no Portal do Parceiro. Não entram em `faltamExtrato`
   * porque não são espera, são bloqueio.
   */
  bloqueadas: { unitId: string; merchantId: string }[]
}

export async function estadoDoPipeline(): Promise<EstadoDoDia> {
  const admin = createAdminClient()

  /**
   * ⚠️ LOJA BLOQUEADA NÃO É LOJA ATRASADA (corrigido 16/08/26).
   *
   * O portão original esperava TODAS as lojas fecharem o extrato. Parece
   * conservador e é frágil: basta UMA loja que não pode fechar pra o relatório
   * nunca sair no horário.
   *
   * Foi exatamente o que aconteceu. A Pizzaria Quero Mais (Vbfood) está com
   * 403 do iFood desde 14/08 — sem permissão, o extrato não é gerado hoje nem
   * amanhã. O relatório das 11h foi adiado quatro janelas seguidas
   * ("faltamExtrato: 1") e só sairia às 20h, marcado como parcial, todo dia,
   * até alguém reautorizar do lado do cliente.
   *
   * A distinção que faltava: ESPERAR faz sentido quando a coisa ainda vai
   * acontecer. Quando não vai, esperar é só atrasar a notícia — e a notícia é
   * justamente que aquela loja está bloqueada. Isso pertence ao CONTEÚDO do
   * relatório, não ao gatilho dele.
   *
   * A régua é a mesma da quarentena do coletor: 403 nas últimas 6 horas.
   */
  const desde403 = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
  const [{ data: vinculos }, foraDoSync, { data: negadas }] = await Promise.all([
    admin
      .from("unit_platforms")
      .select("unit_id, api_store_id, historico_backfill_at, units!inner(id, active)")
      .eq("platform", "ifood")
      .eq("active", true)
      .not("api_store_id", "is", null),
    idsDeUnidadesForaDoSync(),
    admin
      .from("ifood_api_logs")
      .select("merchant_id")
      .eq("response_status", 403)
      .gte("created_at", desde403)
      .not("merchant_id", "is", null),
  ])

  const merchantsNegados = new Set(
    ((negadas ?? []) as { merchant_id: string }[]).map((r) => r.merchant_id),
  )

  const lojas = ((vinculos ?? []) as unknown as {
    unit_id: string
    api_store_id: string
    historico_backfill_at: string | null
    units: { id: string; active: boolean }
  }[]).filter((v) => v.units?.active && !foraDoSync.has(v.units.id))

  const faltamBackfill = lojas.filter((l) => !l.historico_backfill_at).length

  // Quem já fechou o extrato HOJE. Mesma leitura barata do coletor: uma linha
  // por importação, não um group-by na tabela de milhões de lançamentos.
  // Virada do dia em Brasília — ver src/lib/dia-br.ts. Em UTC, este gate dava
  // "rotina fechada" logo depois das 21h, que é quando a fila virava.
  const inicio = inicioDoDiaBR()
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
  const pendentes = lojas.filter((l) => !fecharam.has(l.unit_id))
  const bloqueadas = pendentes
    .filter((l) => merchantsNegados.has(l.api_store_id))
    .map((l) => ({ unitId: l.unit_id, merchantId: l.api_store_id }))
  const faltamExtrato = pendentes.length - bloqueadas.length

  return {
    bloqueadas,
    concluido: faltamExtrato === 0 && faltamBackfill === 0,
    faltamExtrato,
    faltamBackfill,
  }
}

/** O relatório de saúde já saiu hoje? Evita mandar um por janela. */
export async function saudeJaSaiuHoje(): Promise<boolean> {
  const inicio = inicioDoDiaBR()
  const { count } = await createAdminClient()
    .from("email_enviados")
    .select("id", { count: "exact", head: true })
    .eq("tipo", "saude-diaria")
    .gte("enviado_em", inicio)
  return (count ?? 0) > 0
}
