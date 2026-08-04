/**
 * Sync do Cardápio Web — orquestra as duas fases e guarda o cursor.
 *
 * Cada execução faz um PEDAÇO do trabalho e para. É de propósito: uma
 * function da Vercel tem minutos, e detalhar 6 meses de uma loja movimentada
 * leva horas (300 req/3min por loja, 1 chamada por pedido). O cursor em
 * `cardapioweb_sync_state` faz a próxima execução continuar de onde parou.
 *
 * Ordem dentro de uma rodada:
 *   1. Incremental — cabeçalhos novos desde a última janela
 *   2. Backfill    — anda mais uma janela pra trás, se ainda faltar
 *   3. Avaliações  — varredura curta (não filtra por data, mas é barata)
 *   4. Detalhe     — consome a fila até o limite do lote
 *
 * O detalhe vem por último e sempre roda: assim o usuário vê dado útil
 * aparecendo já na primeira execução, em vez de esperar o backfill inteiro.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

import type { CwAmbiente, CwAuthMode } from "./auth"
import {
  detalharPendentes,
  importarHistorico,
  type CwInstall,
} from "./pedidos"
import { sincronizarAvaliacoes } from "./avaliacoes"

/** Janela do backfill. O /orders/history aceita no máximo 6 meses por
 *  consulta; 30 dias por rodada mantém cada execução curta. */
const JANELA_DIAS = 30
/** Quantos pedidos detalhar por execução (~50s a 100 req/min). */
const LOTE_DETALHE = 80

export type ResultadoSync = {
  installId: string
  loja: string
  incremental?: { pedidos: number; erro?: string }
  backfill?: { de: string; ate: string; pedidos: number; erro?: string }
  detalhe?: { processados: number; erros: number; restantes: number }
  avaliacoes?: { gravadas: number; total: number | null; erro?: string }
  concluido: boolean
  erro?: string
}

type InstallRow = {
  id: string
  ambiente: string
  auth_mode: string
  unit_id: string | null
  merchant_name: string | null
  active: boolean
}

type StateRow = {
  install_id: string
  backfill_alvo: string | null
  backfill_cursor: string | null
  backfill_concluido: boolean
  historico_ate: string | null
}

function diasAtras(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

function paraData(s: string | null): Date | null {
  return s ? new Date(s) : null
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Roda uma fatia do sync de uma loja.
 *
 * `mesesAlvo` define até onde o backfill deve voltar (default 6 meses, o
 * teto de uma consulta do histórico).
 */
export async function sincronizarInstall(
  installId: string,
  opts: { mesesAlvo?: number; loteDetalhe?: number } = {},
): Promise<ResultadoSync> {
  const admin = createAdminClient()

  const { data: row } = await admin
    .from("cardapioweb_installs")
    .select("id, ambiente, auth_mode, unit_id, merchant_name, active")
    .eq("id", installId)
    .maybeSingle()

  const inst = row as InstallRow | null
  if (!inst) {
    return {
      installId,
      loja: "?",
      concluido: false,
      erro: "Instalação não encontrada",
    }
  }
  if (!inst.active) {
    return {
      installId,
      loja: inst.merchant_name ?? "?",
      concluido: false,
      erro: "Instalação inativa — reconectar a loja",
    }
  }

  const install: CwInstall = {
    id: inst.id,
    ambiente: inst.ambiente as CwAmbiente,
    authMode: inst.auth_mode as CwAuthMode,
    unitId: inst.unit_id,
  }

  // Garante a linha de estado
  await admin
    .from("cardapioweb_sync_state")
    .upsert({ install_id: installId }, { onConflict: "install_id" })

  const { data: stRow } = await admin
    .from("cardapioweb_sync_state")
    .select(
      "install_id, backfill_alvo, backfill_cursor, backfill_concluido, historico_ate",
    )
    .eq("install_id", installId)
    .single()
  const st = stRow as StateRow

  const hoje = new Date()

  // Até onde o backfill volta. O padrão é 1º de janeiro do ano corrente: é o
  // que o lojista espera ver quando conecta ("o meu ano"), e é o recorte que
  // o dashboard e o DRE usam pra comparar mês a mês. Antes eram 6 meses, o
  // que cortava janeiro/fevereiro no meio do ano sem avisar ninguém.
  //
  // Alvo já guardado só continua valendo se for MAIS FUNDO que o padrão.
  // Instalação que nasceu na regra dos 6 meses tem alvo mais raso, e
  // respeitá-lo deixaria o começo do ano de fora pra sempre.
  const alvoPadrao = opts.mesesAlvo
    ? diasAtras(opts.mesesAlvo * 30)
    : new Date(Date.UTC(hoje.getUTCFullYear(), 0, 1))
  const alvoSalvo = paraData(st.backfill_alvo)
  const alvo = alvoSalvo && alvoSalvo < alvoPadrao ? alvoSalvo : alvoPadrao

  const resultado: ResultadoSync = {
    installId,
    loja: inst.merchant_name ?? installId.slice(0, 8),
    concluido: false,
  }

  // ── 1) Incremental: do último ponto conhecido até hoje ────────────────
  const desde = paraData(st.historico_ate) ?? diasAtras(2)
  const inc = await importarHistorico(install, desde, hoje)
  resultado.incremental = { pedidos: inc.pedidos, erro: inc.erro }

  // ── 2) Backfill: mais uma janela pra trás ─────────────────────────────
  let cursor = paraData(st.backfill_cursor) ?? hoje
  // Alvo alargado reabre um backfill que já tinha se dado por concluído —
  // senão a loja que terminou nos 6 meses nunca buscaria o resto do ano.
  let backfillConcluido = st.backfill_concluido && cursor <= alvo

  if (!backfillConcluido && inc.ok) {
    const fim = new Date(cursor)
    const inicio = new Date(cursor)
    inicio.setDate(inicio.getDate() - JANELA_DIAS)
    const inicioReal = inicio < alvo ? alvo : inicio

    const bf = await importarHistorico(install, inicioReal, fim)
    resultado.backfill = {
      de: iso(inicioReal),
      ate: iso(fim),
      pedidos: bf.pedidos,
      erro: bf.erro,
    }
    if (bf.ok) {
      cursor = inicioReal
      if (inicioReal <= alvo) backfillConcluido = true
    }
  }

  // ── 3) Avaliações ─────────────────────────────────────────────────────
  //
  // Barata e sem cursor: a listagem não filtra por data, mas avaliação não
  // muda depois de escrita, então o upsert por review_id faz repetir sair de
  // graça. Roda antes do detalhe porque é rápida e o detalhe é quem consome o
  // tempo que sobrar.
  const aval = await sincronizarAvaliacoes(install)
  resultado.avaliacoes = {
    gravadas: aval.novas,
    total: aval.total,
    erro: aval.erro,
  }

  // ── 4) Detalhe: consome a fila ────────────────────────────────────────
  const det = await detalharPendentes(install, opts.loteDetalhe ?? LOTE_DETALHE)
  resultado.detalhe = det

  await admin
    .from("cardapioweb_sync_state")
    .update({
      backfill_alvo: iso(alvo),
      backfill_cursor: iso(cursor),
      backfill_concluido: backfillConcluido,
      historico_ate: inc.ok ? hoje.toISOString() : st.historico_ate,
      ultimo_run_at: new Date().toISOString(),
      ultimo_erro: inc.erro ?? resultado.backfill?.erro ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("install_id", installId)

  // "Concluído" = nada mais pra trás E fila vazia.
  resultado.concluido = backfillConcluido && det.restantes === 0
  return resultado
}

/**
 * Roda o sync de TODAS as lojas conectadas — é o que o cron diário chama.
 *
 * Só produção: instalação de sandbox é teste nosso, e gastar a cota de
 * chamadas do Cardápio Web com ela atrasaria loja de cliente de verdade.
 *
 * Uma loja que falha não derruba as outras — o erro fica no resultado dela e
 * o laço segue. Sem isso, a primeira loja com token vencido faria o cron
 * inteiro morrer e ninguém sincronizaria naquele dia.
 */
export async function sincronizarTodas(
  opts: { loteDetalhe?: number; limiteMs?: number } = {},
): Promise<ResultadoSync[]> {
  const admin = createAdminClient()
  const prazo = Date.now() + (opts.limiteMs ?? 4 * 60_000)
  const { data } = await admin
    .from("cardapioweb_installs")
    .select("id, merchant_name")
    .eq("active", true)
    .eq("ambiente", "producao")
    .not("unit_id", "is", null) // sem loja o dado não aparece em tela nenhuma
    .order("created_at")

  const out: ResultadoSync[] = []
  for (const i of data ?? []) {
    const id = i.id as string
    // A function da Vercel tem 5 minutos. Parar de COMEÇAR loja nova perto do
    // teto é melhor que ser cortado no meio: o cursor de cada loja guarda
    // onde parou, então quem ficou de fora entra na rodada seguinte.
    if (Date.now() > prazo) {
      console.log(`[cw-cron] prazo estourou — ${id} fica pra próxima rodada.`)
      break
    }
    try {
      out.push(await sincronizarInstall(id, opts))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[cw-cron] ${i.merchant_name ?? id}: ${msg}`)
      out.push({
        installId: id,
        loja: (i.merchant_name as string | null) ?? id.slice(0, 8),
        concluido: false,
        erro: msg,
      })
    }
  }
  return out
}

/** Roda o sync de todas as lojas ativas de uma holding. */
export async function sincronizarHolding(
  holdingId: string,
  opts: { loteDetalhe?: number } = {},
): Promise<ResultadoSync[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("cardapioweb_installs")
    .select("id")
    .eq("holding_id", holdingId)
    .eq("active", true)

  const out: ResultadoSync[] = []
  for (const i of data ?? []) {
    out.push(await sincronizarInstall(i.id as string, opts))
  }
  return out
}
