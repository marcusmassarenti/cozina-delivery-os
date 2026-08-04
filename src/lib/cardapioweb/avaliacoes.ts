/**
 * Avaliações do Cardápio Web.
 *
 * O que faz esta fonte valer mais que a do iFood: além de nota e comentário,
 * cada avaliação traz SUB-NOTAS por dimensão — atendimento, qualidade do
 * produto, embalagem, tempo de entrega e custo/benefício. No iFood você sabe
 * que levou 3 estrelas; aqui você sabe que foi a embalagem.
 *
 * As dimensões vêm como uma lista de pergunta/resposta e podem mudar de nome
 * ou de quantidade sem aviso, então são guardadas em jsonb (`respostas`) em vez
 * de virar coluna. Coluna nova a cada mudança deles seria migration a cada
 * mudança deles.
 *
 * A listagem NÃO aceita filtro por data — só paginação. Igual aos clientes, a
 * atualização é varredura do começo. Como avaliação não some nem muda depois
 * de escrita, o upsert por (install_id, review_id) faz a repetição ser barata:
 * a mesma avaliação simplesmente sobrescreve a si mesma.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

import { fetchCw } from "./client"
import type { CwInstall } from "./pedidos"

/** Teto da API. Igual ao de clientes. */
const PER_PAGE = 50
/** Páginas por execução — segura o tempo da function e o rate limit. */
const PAGINAS_POR_RODADA = 6

type CwResposta = {
  question_id?: number | string
  question?: string | null
  answer?: string | null
}

type CwAvaliacao = {
  id?: number | string
  order_id?: number | string | null
  customer_id?: number | string | null
  rating?: number | null
  comment?: string | null
  created_at?: string | null
  answers?: CwResposta[] | null
}

type Resposta = {
  reviews?: CwAvaliacao[]
  pagination?: { current_page?: number; total_pages?: number; total_reviews?: number }
}

export type ResultadoAvaliacoes = {
  novas: number
  paginas: number
  total: number | null
  erro?: string
}

/**
 * Puxa as avaliações da loja e grava.
 *
 * Devolve o que aconteceu em vez de lançar: uma loja com token vencido não
 * pode derrubar o sync das outras no cron.
 */
export async function sincronizarAvaliacoes(
  install: CwInstall,
): Promise<ResultadoAvaliacoes> {
  const admin = createAdminClient()
  let novas = 0
  let paginas = 0
  let total: number | null = null

  for (let pagina = 1; pagina <= PAGINAS_POR_RODADA; pagina++) {
    const r = await fetchCw<Resposta>({
      installId: install.id,
      ambiente: install.ambiente,
      path: `/api/partner/v1/merchant/reviews?page=${pagina}&per_page=${PER_PAGE}`,
      tier: "lento",
      endpointLabel: "GET /merchant/reviews",
    })

    if (!r.ok) {
      return { novas, paginas, total, erro: `HTTP ${r.status}` }
    }

    const lista = r.data?.reviews ?? []
    total = r.data?.pagination?.total_reviews ?? total
    paginas++

    if (lista.length === 0) break

    const linhas = lista
      .filter((a) => a.id != null)
      .map((a) => {
        // A data da avaliação é a régua do período. Sem ela o registro existe
        // mas não aparece em mês nenhum — pior que não ter.
        const quando = a.created_at ? new Date(a.created_at) : null
        const valida = quando && !Number.isNaN(quando.getTime())
        return {
          install_id: install.id,
          unit_id: install.unitId,
          review_id: String(a.id),
          order_id: a.order_id != null ? String(a.order_id) : null,
          customer_cw_id: a.customer_id != null ? String(a.customer_id) : null,
          nota: typeof a.rating === "number" ? a.rating : null,
          comentario: a.comment?.trim() || null,
          respostas: a.answers ?? null,
          criado_em: valida ? quando.toISOString() : null,
          // Mês de referência no fuso de Brasília: avaliação das 23h do dia 31
          // é do mês que fecha, não do seguinte.
          ref_year: valida ? Number(mesBR(quando).slice(0, 4)) : null,
          ref_month: valida ? Number(mesBR(quando).slice(5, 7)) : null,
          raw: a as unknown as Record<string, unknown>,
          synced_at: new Date().toISOString(),
        }
      })

    if (linhas.length > 0) {
      const { error } = await admin
        .from("cardapioweb_avaliacoes")
        .upsert(linhas, { onConflict: "install_id,review_id" })
      if (error) return { novas, paginas, total, erro: error.message }
      novas += linhas.length
    }

    const totalPaginas = r.data?.pagination?.total_pages ?? 1
    if (pagina >= totalPaginas) break
  }

  return { novas, paginas, total }
}

/** "YYYY-MM" no fuso de São Paulo. */
function mesBR(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(d)
}
