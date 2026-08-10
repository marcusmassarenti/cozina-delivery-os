import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Expurgo dos logs de chamada da API do iFood.
 *
 * POR QUE EXISTE: `ifood_api_logs` guarda o corpo inteiro da resposta de cada
 * chamada e nasceu sem nenhuma regra de validade. Medido em 09/08/2026: 217 MB
 * em 89.188 linhas, crescendo desde 16/jun sem teto — e num dia de backfill
 * pesado entram 11 mil linhas sozinhas. Isso é diagnóstico, não dado de
 * negócio: o histórico que importa mora em `ifood_financeiro_lancamentos` e
 * `ifood_pedidos`, que continuam intactos.
 *
 * ⚠️ 90 DIAS foi decisão do Marcus (09/08/2026), não um padrão meu. É o mais
 * conservador dos que estavam na mesa: hoje não apaga quase nada (a tabela tem
 * 55 dias de vida), só põe o limite antes de virar problema.
 *
 * NÃO É FUNÇÃO DO BANCO de propósito. Um `security definer` novo seria mais
 * uma porta pra fechar contra o anônimo — o P0 que já voltou duas vezes neste
 * projeto (jul e ago/26). Aqui é o admin client, atrás do segredo do cron.
 *
 * NÃO tem credencial no que é apagado: o `Authorization` já entra mascarado
 * como `Bearer ***` (conferido nas 89.188 linhas). O expurgo é por espaço.
 */

export const DIAS_DE_LOG = 90

export async function expurgarLogsApi(
  dias = DIAS_DE_LOG,
): Promise<{ apagados: number; corte: string }> {
  const corte = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()
  const admin = createAdminClient()

  // `count: "exact"` pra o resumo do cron dizer QUANTO saiu. "Rodou" sem
  // número não distingue expurgo funcionando de expurgo que não pegou nada.
  const { error, count } = await admin
    .from("ifood_api_logs")
    .delete({ count: "exact" })
    .lt("created_at", corte)

  if (error) throw new Error(`expurgo de ifood_api_logs: ${error.message}`)
  return { apagados: count ?? 0, corte }
}
