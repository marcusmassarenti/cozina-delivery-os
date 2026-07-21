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
 *   3. Detalhe     — consome a fila até o limite do lote
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
  const alvo =
    paraData(st.backfill_alvo) ?? diasAtras((opts.mesesAlvo ?? 6) * 30)

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
  let backfillConcluido = st.backfill_concluido

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

  // ── 3) Detalhe: consome a fila ────────────────────────────────────────
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
