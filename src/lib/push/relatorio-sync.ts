/**
 * Um push por sync, mandado pelo próprio cron quando ele termina.
 *
 * Três rotinas, três horários, três relatórios: iFood financeiro às 4h,
 * avaliações às 5h, 99 Food às 6h. O aviso chega junto com o fim de cada uma,
 * então dá pra agir na que falhou sem esperar o fechamento da manhã.
 *
 * O que este push NÃO cobre, e por isso o `resumo-importacao` (6h30) existe:
 * cron que não roda não manda nada. Silêncio aqui é ambíguo — pode ser "deu
 * tudo certo" ou "a rotina nunca disparou". Quem desfaz a ambiguidade é o
 * fechamento, lendo `cron_runs`.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { enviarPush } from "@/lib/push/enviar"

/**
 * Quem recebe relatório de rotina: superadmin.
 *
 * É operação da plataforma, não do negócio do cliente — franqueado não tem o
 * que fazer com "o sync das 4h falhou", e receber isso só ensinaria a ignorar
 * notificação.
 */
export async function idsSuperadmin(): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("profiles")
    .select("user_id")
    .eq("is_superadmin", true)
  return ((data ?? []) as { user_id: string }[]).map((a) => a.user_id)
}

export type RelatorioSync = {
  /** Nome da rotina como ela aparece no push. Ex.: "iFood financeiro". */
  rotulo: string
  /** A rotina chegou ao fim? false = estourou antes de terminar. */
  ok: boolean
  lojas: number
  erros: number
  /** O número que interessa do dia. Ex.: "1.204 lançamentos novos". */
  destaque?: string
  /** Sufixo do `tag`: o relatório de hoje substitui o de ontem na tela. */
  chave: string
}

const n = (v: number) => v.toLocaleString("pt-BR")

export async function enviarRelatorioSync(r: RelatorioSync): Promise<{
  enviados: number
  destinatarios: number
  titulo: string
  corpo: string
}> {
  let titulo: string
  let corpo: string

  if (!r.ok) {
    titulo = `❌ ${r.rotulo} não completou`
    corpo = "A rotina parou antes do fim. O dado de hoje está incompleto."
  } else if (r.erros > 0) {
    // Erro parcial é o caso que mais engana: a rotina "funcionou", e mesmo
    // assim há loja sem o dado de hoje. Por isso o número de falhas vem no
    // título, e não escondido no corpo.
    titulo = `⚠️ ${r.rotulo} · ${n(r.erros)} ${r.erros === 1 ? "loja com erro" : "lojas com erro"}`
    corpo = `${n(r.lojas - r.erros)} de ${n(r.lojas)} lojas ok${r.destaque ? ` · ${r.destaque}` : ""}.`
  } else {
    titulo = `✅ ${r.rotulo} importou`
    corpo = `${n(r.lojas)} ${r.lojas === 1 ? "loja" : "lojas"}${r.destaque ? ` · ${r.destaque}` : ""}.`
  }

  const userIds = await idsSuperadmin()
  if (userIds.length === 0) {
    return { enviados: 0, destinatarios: 0, titulo, corpo }
  }

  const res = await enviarPush(userIds, {
    titulo,
    corpo,
    url: "/saude",
    tag: `sync-${r.chave}`,
  })
  return { enviados: res.enviados, destinatarios: userIds.length, titulo, corpo }
}

/**
 * Manda o relatório sem nunca derrubar o cron que o chamou.
 *
 * A ordem importa: o sync já terminou e já gravou quando isto roda. Deixar uma
 * falha de notificação marcar o cron como vermelho faria o `resumo-importacao`
 * e o relatório de saúde acusarem perda de dado que não houve.
 */
export async function tentarRelatorioSync(r: RelatorioSync): Promise<unknown> {
  try {
    return await enviarRelatorioSync(r)
  } catch (e) {
    console.error(`relatorio-sync (${r.chave}):`, e)
    return { erro: e instanceof Error ? e.message : String(e) }
  }
}
