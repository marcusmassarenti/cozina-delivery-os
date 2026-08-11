import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { textoOuNull } from "@/lib/format"
import { fetchAllRows } from "@/lib/data/paginate"
import { installIdsDeProducao } from "@/lib/data/cardapioweb-imported"
import type { PlatformId } from "@/components/platform-logo"

export type ComentarioNegativo = {
  unitId: string
  plataforma: PlatformId
  nota: number
  comentario: string
  data: string | null
  /** O que a LOJA respondeu. Null = ninguém respondeu esse cliente ainda. */
  resposta: string | null
  /**
   * id da linha em ifood_avaliacoes + id da avaliação no iFood. Só vem no
   * iFood, e só nas que entraram depois da 0182 — é o que habilita o botão
   * "Responder". Sem os dois, a tela só exibe.
   */
  avaliacaoId?: string
  reviewId?: string | null
}

/**
 * Comentários negativos (nota ≤ maxNota, com texto) do mês, nas QUATRO
 * plataformas, pras unidades pedidas. Ordenado do pior pro menos pior, depois
 * mais recente.
 *
 *  - iFood:   ifood_avaliacoes (nota, comentario, data_avaliacao DATE)
 *  - 99 Food: ninefood_pedidos (nivel_avaliacao, conteudo_avaliacao, ts)
 *  - Keeta:   keeta_pedidos (pontuacao_avaliacao, conteudo_avaliacao, DATE)
 *  - Cardápio Web: cardapioweb_avaliacoes (nota, comentario, criado_em)
 *
 * O canal próprio entrou depois. Enquanto ficou de fora, a reclamação de um
 * cliente que comprou direto da loja NUNCA aparecia nesta tela — que existe
 * justamente pra agir rápido em cima de crítica. Numa loja sem marketplace, a
 * tela ficava permanentemente vazia como se não houvesse reclamação nenhuma.
 */
export async function getComentariosNegativos(
  year: number,
  month: number,
  filterUnitIds?: string[],
  maxNota = 2,
): Promise<ComentarioNegativo[]> {
  const admin = createAdminClient()
  const monthStr = String(month).padStart(2, "0")
  const startIso = `${year}-${monthStr}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const endExcl = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endIncl = `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`

  const out: ComentarioNegativo[] = []

  // iFood
  {
    const data = await fetchAllRows<{
      id: string
      unit_id: string
      nota: number
      comentario: string | null
      data_avaliacao: string | null
      resposta_texto: string | null
      review_id: string | null
    }>((from, to) => {
      let q = admin
        .from("ifood_avaliacoes")
        .select(
          "id, unit_id, nota, comentario, data_avaliacao, resposta_texto, review_id",
        )
        .lte("nota", maxNota)
        .not("comentario", "is", null)
        .gte("data_avaliacao", startIso)
        .lte("data_avaliacao", endIncl)
        .order("id")
        .range(from, to)
      if (filterUnitIds) q = q.in("unit_id", filterUnitIds)
      return q
    }, "negativos ifood")
    for (const r of data ?? []) {
      const c = String(r.comentario ?? "").trim()
      if (!c) continue
      out.push({
        unitId: r.unit_id as string,
        plataforma: "ifood",
        nota: Number(r.nota),
        comentario: c,
        data: (r.data_avaliacao as string | null) ?? null,
        resposta: textoOuNull(r.resposta_texto),
        avaliacaoId: r.id as string,
        reviewId: (r.review_id as string | null) ?? null,
      })
    }
  }

  // 99 Food
  {
    const data = await fetchAllRows<{
      unit_id: string
      nivel_avaliacao: number
      conteudo_avaliacao: string | null
      data_avaliacao: string | null
    }>((from, to) => {
      let q = admin
        .from("ninefood_pedidos")
        .select("unit_id, nivel_avaliacao, conteudo_avaliacao, data_avaliacao")
        .lte("nivel_avaliacao", maxNota)
        .not("conteudo_avaliacao", "is", null)
        .gte("data_avaliacao", startIso)
        .lt("data_avaliacao", endExcl)
        .order("id")
        .range(from, to)
      if (filterUnitIds) q = q.in("unit_id", filterUnitIds)
      return q
    }, "negativos 99food")
    for (const r of data ?? []) {
      const c = String(r.conteudo_avaliacao ?? "").trim()
      if (!c) continue
      out.push({
        unitId: r.unit_id as string,
        plataforma: "99food",
        nota: Number(r.nivel_avaliacao),
        comentario: c,
        data: (r.data_avaliacao as string | null) ?? null,
        // A planilha da 99 não traz a resposta da loja em coluna nenhuma.
        resposta: null,
      })
    }
  }

  // Keeta
  {
    const data = await fetchAllRows<{
      unit_id: string
      pontuacao_avaliacao: number
      conteudo_avaliacao: string | null
      data_avaliacao: string | null
      resposta_avaliacao: string | null
    }>((from, to) => {
      let q = admin
        .from("keeta_pedidos")
        .select(
          "unit_id, pontuacao_avaliacao, conteudo_avaliacao, data_avaliacao, resposta_avaliacao",
        )
        .lte("pontuacao_avaliacao", maxNota)
        .not("conteudo_avaliacao", "is", null)
        .gte("data_avaliacao", startIso)
        .lte("data_avaliacao", endIncl)
        .order("id")
        .range(from, to)
      if (filterUnitIds) q = q.in("unit_id", filterUnitIds)
      return q
    }, "negativos keeta")
    for (const r of data ?? []) {
      const c = String(r.conteudo_avaliacao ?? "").trim()
      if (!c) continue
      out.push({
        unitId: r.unit_id as string,
        plataforma: "keeta",
        nota: Number(r.pontuacao_avaliacao),
        comentario: c,
        data: (r.data_avaliacao as string | null) ?? null,
        // A Keeta já vinha com a resposta gravada desde o primeiro import —
        // 165 respostas que nenhuma tela lia.
        resposta: textoOuNull(r.resposta_avaliacao),
      })
    }
  }

  // Cardápio Web (canal próprio). Só instalação de produção: sandbox tem
  // avaliação fictícia e viraria reclamação falsa na tela de ação.
  {
    const installs = await installIdsDeProducao()
    if (installs.length > 0) {
      const data = await fetchAllRows<{
        unit_id: string | null
        nota: number | null
        comentario: string | null
        criado_em: string | null
      }>((from, to) => {
        let q = admin
          .from("cardapioweb_avaliacoes")
          .select("unit_id, nota, comentario, criado_em")
          .in("install_id", installs)
          .not("unit_id", "is", null)
          .not("comentario", "is", null)
          .lte("nota", maxNota)
          .gte("criado_em", `${startIso}T00:00:00-03:00`)
          .lt("criado_em", `${endExcl}T00:00:00-03:00`)
          .order("id")
          .range(from, to)
        if (filterUnitIds) q = q.in("unit_id", filterUnitIds)
        return q
      }, "negativos cardapioweb")
      for (const r of data ?? []) {
        const c = String(r.comentario ?? "").trim()
        if (!c || !r.unit_id) continue
        out.push({
          unitId: r.unit_id,
          plataforma: "cardapioweb",
          nota: Number(r.nota),
          // ⚠️ cardapioweb_avaliacoes.respostas NÃO é a loja respondendo: é o
          // CLIENTE respondendo as sub-perguntas (Atendimento, Embalagem…).
          // Usar aquele campo aqui mostraria "5" como se fosse a resposta do
          // restaurante.
          resposta: null,
          comentario: c,
          // As outras fontes guardam DATE; aqui é timestamp. Corta pra data
          // pura senão a ordenação por string compara formatos diferentes.
          data: r.criado_em ? r.criado_em.slice(0, 10) : null,
        })
      }
    }
  }

  out.sort(
    (a, b) =>
      a.nota - b.nota || (b.data ?? "").localeCompare(a.data ?? ""),
  )
  return out
}
