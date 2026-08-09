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
 * SOBRE O PERÍODO — não chamar sem data. O endpoint ACEITA `start_date` e
 * `end_date` (retroage até 3 anos, janela máxima de 6 meses), e o
 * comportamento SEM eles não é documentado. A primeira versão daqui não
 * passava datas e devolveu 1 avaliação; conferindo por janelas explícitas, o
 * total era mesmo 1 — mas por sorte. Numa loja com avaliações espalhadas, o
 * padrão poderia devolver só um pedaço e ninguém perceberia, porque um número
 * menor de avaliações não parece erro, parece loja pouco avaliada.
 *
 * Então a varredura é por JANELAS de 150 dias (folga sob o teto de 6 meses),
 * andando pra trás. O padrão cobre pouco mais de um ano — o que interessa no
 * dia a dia — e `janelas` maior serve pra puxar o histórico fundo uma vez.
 *
 * Como avaliação não some nem muda depois de escrita, o upsert por
 * (install_id, review_id) faz repetir sair de graça: a mesma avaliação
 * sobrescreve a si mesma.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

import { fetchCw } from "./client"
import type { CwInstall } from "./pedidos"

/** Teto da API: 100 por página em avaliações. */
const PER_PAGE = 100
/** Páginas por janela. 100 × 5 = 500 avaliações num recorte de 5 meses. */
const PAGINAS_POR_JANELA = 5
/** Tamanho da janela. O teto da API é 6 meses; 150 dias deixa folga. */
const JANELA_DIAS = 150
/** Janelas por execução — 3 × 150d ≈ 15 meses, com 3 a 15 chamadas. */
const JANELAS_PADRAO = 3
/** Janelas da PRIMEIRA varredura — cobre o teto de 3 anos da API. */
const JANELAS_PRIMEIRA = 8
/**
 * Teto de retroatividade da API, em dias. Documentado como 3 anos, e
 * confirmado na marra: pedir uma janela que começa antes disso devolve HTTP
 * 400 e derruba a varredura inteira no meio.
 */
const RETROATIVIDADE_DIAS = 365 * 3 - 5

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
  /** Linhas gravadas (inclui as que já existiam e foram sobrescritas). */
  novas: number
  paginas: number
  /** Quantas a API disse existir no período varrido. */
  total: number | null
  /** Até onde a varredura voltou — pra tela poder dizer o alcance. */
  ate: string | null
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
  opts: { janelas?: number } = {},
): Promise<ResultadoAvaliacoes> {
  const admin = createAdminClient()

  // Varre fundo UMA vez; depois disso o dia a dia só precisa do horizonte
  // curto, porque avaliação não muda depois de escrita.
  //
  // ⚠️ O gatilho é "JÁ VARRI?", carimbado em cardapioweb_sync_state, e não
  // "tenho avaliação guardada?". Era assim antes, e loja que genuinamente não
  // tem avaliação nenhuma nunca saía do estado zero: refazia a varredura de 3
  // anos todo dia, para sempre. Medido em 08/08/26 numa instalação real: 24
  // chamadas em 3 dias, todas devolvendo total_reviews 0. "Não tenho dado" não
  // é o mesmo que "nunca procurei".
  let janelas = opts.janelas
  let carimbarVarredura = false
  if (janelas === undefined) {
    const { data: st } = await admin
      .from("cardapioweb_sync_state")
      .select("avaliacoes_varredura_em")
      .eq("install_id", install.id)
      .maybeSingle()
    const nuncaVarreu = !st?.avaliacoes_varredura_em
    janelas = nuncaVarreu ? JANELAS_PRIMEIRA : JANELAS_PADRAO
    carimbarVarredura = nuncaVarreu
  }

  const piso = new Date()
  piso.setDate(piso.getDate() - RETROATIVIDADE_DIAS)

  let novas = 0
  let paginas = 0
  let total = 0
  let ate: string | null = null

  let fim = new Date()
  for (let j = 0; j < janelas; j++) {
    // Passou do teto de 3 anos: não adianta insistir, a API recusa a janela
    // inteira com 400 e a varredura morre no meio sem dizer por quê.
    if (fim <= piso) break
    const inicio = new Date(fim)
    inicio.setDate(inicio.getDate() - JANELA_DIAS)
    if (inicio < piso) inicio.setTime(piso.getTime())
    ate = inicio.toISOString().slice(0, 10)

    for (let pagina = 1; pagina <= PAGINAS_POR_JANELA; pagina++) {
      const q = new URLSearchParams({
        start_date: inicio.toISOString(),
        end_date: fim.toISOString(),
        page: String(pagina),
        per_page: String(PER_PAGE),
      })
      const r = await fetchCw<Resposta>({
        installId: install.id,
        ambiente: install.ambiente,
        path: `/api/partner/v1/merchant/reviews?${q.toString()}`,
        tier: "lento",
        endpointLabel: "GET /merchant/reviews",
      })

      if (!r.ok) {
        // Falha vira erro reportado, não silêncio: uma janela que não veio é
        // avaliação faltando, e faltar avaliação parece "loja pouco avaliada".
        return { novas, paginas, total, ate, erro: `HTTP ${r.status}` }
      }

      const lista = r.data?.reviews ?? []
      paginas++
      if (pagina === 1) total += r.data?.pagination?.total_reviews ?? 0
      if (lista.length === 0) break

      const linhas = lista
        .filter((a) => a.id != null)
        .map((a) => {
          // A data é a régua do período. Sem ela o registro existe mas não
          // aparece em mês nenhum — pior que não ter.
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
            // Mês de referência no fuso de Brasília: avaliação das 23h do dia
            // 31 é do mês que fecha, não do seguinte.
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
        if (error) return { novas, paginas, total, ate, erro: error.message }
        novas += linhas.length
      }

      const totalPaginas = r.data?.pagination?.total_pages ?? 1
      if (pagina >= totalPaginas) break
    }

    fim = inicio
  }

  // Carimba só no fim e só se nada falhou: varredura interrompida no meio não
  // vale como varredura, e marcar assim mesmo deixaria um buraco permanente.
  // (Toda falha acima sai por `return` com `erro`, então chegar aqui é sucesso.)
  if (carimbarVarredura) {
    await admin
      .from("cardapioweb_sync_state")
      .update({ avaliacoes_varredura_em: new Date().toISOString() })
      .eq("install_id", install.id)
  }

  return { novas, paginas, total, ate }
}

/** "YYYY-MM" no fuso de São Paulo. */
function mesBR(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(d)
}
