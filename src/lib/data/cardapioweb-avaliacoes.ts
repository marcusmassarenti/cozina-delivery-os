import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

import {
  installIdsDeProducao,
  type DateRange,
} from "@/lib/data/cardapioweb-imported"

/**
 * Avaliações do Cardápio Web.
 *
 * O que esta fonte tem e o iFood não: SUB-NOTAS por dimensão — atendimento,
 * qualidade do produto, embalagem, tempo de entrega e custo/benefício. No iFood
 * a loja sabe que levou 3 estrelas; aqui sabe que foi a embalagem.
 *
 * Agregado no banco (RPC `cardapioweb_avaliacoes_resumo`), inclusive a média
 * por dimensão — que exige abrir um jsonb por avaliação e não caberia numa
 * consulta simples do PostgREST.
 */

export type DimensaoAvaliacao = {
  dimensao: string
  media: number
  respostas: number
}

export type ComentarioCw = {
  reviewId: string
  nota: number | null
  comentario: string
  criadoEm: string | null
  orderId: string | null
}

export type AvaliacoesCw = {
  total: number
  media: number | null
  comComentario: number
  /** nota (1–5) → quantidade */
  distribuicao: Record<string, number>
  /** Ordenadas da PIOR pra melhor: o que precisa de ação vem primeiro. */
  dimensoes: DimensaoAvaliacao[]
  comentarios: ComentarioCw[]
  temDados: boolean
}

export function avaliacoesVazio(): AvaliacoesCw {
  return {
    total: 0,
    media: null,
    comComentario: 0,
    distribuicao: {},
    dimensoes: [],
    comentarios: [],
    temDados: false,
  }
}

export async function getAvaliacoesCardapioWeb(
  unitIds: string[],
  year: number,
  month: number,
  dateRange?: DateRange,
): Promise<AvaliacoesCw> {
  if (unitIds.length === 0) return avaliacoesVazio()

  const inicio = dateRange
    ? `${dateRange.start}T00:00:00-03:00`
    : `${year}-${String(month).padStart(2, "0")}-01T00:00:00-03:00`
  const fim = dateRange
    ? new Date(`${dateRange.end}T00:00:00-03:00`)
    : new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00-03:00`)
  if (dateRange) fim.setDate(fim.getDate() + 1)
  else fim.setMonth(fim.getMonth() + 1)

  const admin = createAdminClient()
  const installs = await installIdsDeProducao()
  if (installs.length === 0) return avaliacoesVazio()

  const { data, error } = await admin.rpc("cardapioweb_avaliacoes_resumo", {
    p_unit_ids: unitIds,
    p_inicio: inicio,
    p_fim: fim.toISOString(),
    p_install_ids: installs,
  })
  if (error) throw new Error(`cardapioweb_avaliacoes_resumo: ${error.message}`)

  const b = (data ?? {}) as {
    total?: number
    media?: number | null
    comMuitoComentario?: number
    distribuicao?: Record<string, number>
    dimensoes?: DimensaoAvaliacao[]
    comentarios?: ComentarioCw[]
  }

  return {
    total: Number(b.total ?? 0) || 0,
    media: b.media != null ? Number(b.media) : null,
    comComentario: Number(b.comMuitoComentario ?? 0) || 0,
    distribuicao: b.distribuicao ?? {},
    dimensoes: (b.dimensoes ?? []).map((d) => ({
      dimensao: d.dimensao,
      media: Number(d.media) || 0,
      respostas: Number(d.respostas) || 0,
    })),
    comentarios: b.comentarios ?? [],
    temDados: (Number(b.total ?? 0) || 0) > 0,
  }
}
