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

/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Mesmo formato das outras plataformas, pro Dashboard consumir sem caso
 * especial.
 *
 * As sub-notas por dimensão são a riqueza desta fonte, mas aqui viram
 * `topTagsNegativas` — o card do Dashboard chama de "o que reclamam", e a
 * dimensão pior avaliada é literalmente isso. Assim o canal próprio ocupa o
 * mesmo espaço visual das outras, sem componente novo.
 */
export type NetworkCwAvaliacoes = {
  total: number
  notaMedia: number
  distribucao: Record<1 | 2 | 3 | 4 | 5, number>
  comComentario: number
  topTagsPositivas: Array<{ tag: string; count: number }>
  topTagsNegativas: Array<{ tag: string; count: number }>
  ultimosComentarios: Array<{
    id: string
    unitId: string
    unitCode: string
    unitName: string
    nota: number
    comentario: string
    data: string | null
  }>
  hasData: boolean
}

export async function getNetworkCardapioWebAvaliacoesForMonth(
  unitIds: string[],
  year: number,
  month: number,
): Promise<NetworkCwAvaliacoes> {
  const vazio: NetworkCwAvaliacoes = {
    total: 0,
    notaMedia: 0,
    distribucao: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    comComentario: 0,
    topTagsPositivas: [],
    topTagsNegativas: [],
    ultimosComentarios: [],
    hasData: false,
  }
  if (unitIds.length === 0) return vazio

  const a = await getAvaliacoesCardapioWeb(unitIds, year, month)
  if (!a.temDados) return vazio

  // Nome da loja pra cada comentário. O resumo agregado não carrega isso —
  // e no Dashboard o comentário sem a loja não serve pra agir.
  const admin = createAdminClient()
  const inicio = `${year}-${String(month).padStart(2, "0")}-01T00:00:00-03:00`
  const fim = new Date(inicio)
  fim.setMonth(fim.getMonth() + 1)

  const { data: linhas } = await admin
    .from("cardapioweb_avaliacoes")
    .select("review_id, unit_id, nota, comentario, criado_em")
    .in("unit_id", unitIds)
    .not("comentario", "is", null)
    .gte("criado_em", inicio)
    .lt("criado_em", fim.toISOString())
    .order("criado_em", { ascending: false })
    // Teto explícito: é uma lista de "últimos", não um relatório. Sem limite,
    // uma rede grande baixaria o mês inteiro pra mostrar cinco linhas.
    .limit(20)

  const lojas = new Map<string, { code: string; name: string }>()
  const ids = [...new Set((linhas ?? []).map((l) => l.unit_id as string))]
  if (ids.length > 0) {
    const { data: us } = await admin
      .from("units")
      .select("id, code, name")
      .in("id", ids)
    for (const u of us ?? []) lojas.set(u.id, { code: u.code, name: u.name })
  }

  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<
    1 | 2 | 3 | 4 | 5,
    number
  >
  for (const [n, q] of Object.entries(a.distribuicao)) {
    const k = Number(n) as 1 | 2 | 3 | 4 | 5
    if (k >= 1 && k <= 5) dist[k] = q
  }

  // Dimensão vira "tag": as piores viram o que reclamam, as melhores o que
  // elogiam. O corte em 4.0 é o mesmo que a tela usa pra pintar de vermelho.
  const dims = a.dimensoes
  return {
    total: a.total,
    notaMedia: a.media ?? 0,
    distribucao: dist,
    comComentario: a.comComentario,
    topTagsPositivas: dims
      .filter((d) => d.media >= 4.5)
      .slice(-5)
      .reverse()
      .map((d) => ({ tag: d.dimensao, count: d.respostas })),
    topTagsNegativas: dims
      .filter((d) => d.media < 4.5)
      .slice(0, 5)
      .map((d) => ({ tag: d.dimensao, count: d.respostas })),
    ultimosComentarios: (linhas ?? []).map((l) => ({
      id: String(l.review_id),
      unitId: String(l.unit_id),
      unitCode: lojas.get(l.unit_id as string)?.code ?? "?",
      unitName: lojas.get(l.unit_id as string)?.name ?? "(loja)",
      nota: Number(l.nota) || 0,
      comentario: String(l.comentario ?? "").trim(),
      data: l.criado_em ? String(l.criado_em).slice(0, 10) : null,
    })),
    hasData: true,
  }
}
