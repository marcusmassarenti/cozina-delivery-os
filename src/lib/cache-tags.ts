/**
 * Cache dos agregados mensais + as etiquetas que os derrubam.
 *
 * As tags ficam num arquivo só porque o par tem que casar: se a leitura marca
 * uma tag e a gravação derruba outra, o cache serve número velho pra sempre e
 * ninguém percebe — que é exatamente o tipo de silêncio que já custou caro
 * aqui (29/07: junho voltou ao normal no banco; se o painel não soubesse,
 * continuaria mostrando o mês quebrado).
 */
import "server-only"

import { unstable_cache } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"

/** Conciliação do iFood — tudo derivado de ifood_financeiro_lancamentos. */
export const TAG_FINANCEIRO_IFOOD = "ifood-financeiro"
/** Pedidos da 99 Food (webhook + planilha). */
export const TAG_99FOOD = "99food-pedidos"
/** Fatura e pedidos da Keeta. */
export const TAG_KEETA = "keeta-dados"

export const TODAS_AS_TAGS = [
  TAG_FINANCEIRO_IFOOD,
  TAG_99FOOD,
  TAG_KEETA,
] as const

/** Mês corrente em São Paulo — o único que ainda pode mudar sozinho. */
export function mesCorrenteBR(): { ano: number; mes: number } {
  const [ano, mes] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .split("-")
    .map(Number)
  return { ano, mes }
}

export function mesFechado(year: number, month: number): boolean {
  const c = mesCorrenteBR()
  return year < c.ano || (year === c.ano && month < c.mes)
}

/**
 * Chama uma RPC `(p_unit_ids, p_year, p_month)` com cache de mês FECHADO.
 *
 * Mês encerrado não muda sozinho — recalculá-lo a cada abertura do dashboard
 * (o gráfico de evolução pede janeiro a julho toda vez) era o grosso da
 * espera. Mês corrente nunca entra no cache.
 *
 * A chave inclui as lojas: o mesmo mês pedido pra recortes diferentes de
 * unidade é resultado diferente. Ordenada, senão a ordem do filtro cria
 * entradas duplicadas pro mesmo conjunto.
 */
export async function rpcMensalComCache<T>(
  nome: string,
  unitIds: string[],
  year: number,
  month: number,
  tag: string,
): Promise<{ data: T[] | null; error: string | null }> {
  const chamar = async () => {
    const { data, error } = await createAdminClient().rpc(nome, {
      p_unit_ids: unitIds,
      p_year: year,
      p_month: month,
    })
    return { data: (data ?? null) as T[] | null, error: error?.message ?? null }
  }

  if (!mesFechado(year, month)) return chamar()

  // FALHA NÃO ENTRA NO CACHE — mesma correção do resumo do iFood, e pelo mesmo
  // motivo: `{ data: null, error }` é um valor como outro qualquer, então uma
  // consulta que falhasse UMA vez ficava 24h guardada como resposta do mês.
  // Quem lê trata erro devolvendo lista vazia, e aí a plataforma inteira some
  // do mês sem nenhum aviso — o número apenas fica menor.
  //
  // Este helper serve Keeta, 99 Food e o Relatório Diário, então o buraco era
  // maior que o do iFood, que foi onde ele apareceu (julho/26 da Pinheiros).
  //
  // Lançando dentro da função cacheada, o Next não guarda nada e a próxima
  // requisição tenta de novo.
  const semCachearFalha = async () => {
    const r = await chamar()
    if (r.error) throw new Error(`${nome} falhou: ${r.error}`)
    return r
  }

  return unstable_cache(
    semCachearFalha,
    [nome, `${year}-${month}-${[...unitIds].sort().join(",")}`],
    { tags: [tag], revalidate: 86_400 },
  )().catch((e) => ({
    data: null,
    error: e instanceof Error ? e.message : String(e),
  }))
}

/**
 * Limpa os agregados em cache. Chamada depois de gravação que mexa em mês
 * fechado (importação, sync, reimportação).
 *
 * Sem argumento derruba tudo — é o que as importações manuais usam: são raras,
 * disparadas por gente, e errar pra menos ali significa número velho na tela.
 *
 * ⚠️ ROTINA AUTOMÁTICA NÃO PODE DERRUBAR TUDO (DG FOODS, 25/09/26). O cron dos
 * webhooks do 99 roda a cada 10 min e chamava esta função sem argumento ao
 * terminar — derrubando também o cache do iFood, que o 99 nem toca. Na
 * prática o mês fechado nunca ficava em cache: toda abertura de relatório
 * recalculava todos os meses no banco. Pra rede de 80 lojas, a Evolução pedia
 * 9 meses de uma vez, as consultas passavam dos 8s e eram canceladas (105
 * falhas em 5 minutos); o cliente clicava no Hub de Relatórios e nada abria.
 * Rotina automática usa `limparSeTocouMesFechado`, com a tag da própria
 * plataforma.
 */
export async function limparCacheAgregados(
  tags: readonly string[] = TODAS_AS_TAGS,
): Promise<void> {
  try {
    const { revalidateTag } = await import("next/cache")
    // Next 16 exige o perfil de expiração no segundo argumento.
    for (const t of tags) revalidateTag(t, { expire: 0 })
  } catch (e) {
    // Fora de um contexto de request (script avulso) não há cache pra limpar.
    console.warn("limparCacheAgregados ignorado:", e)
  }
}

/**
 * Derruba o cache de UMA plataforma, e só se a gravação tocou mês FECHADO.
 *
 * Mês corrente nunca entra no cache (ver `rpcMensalComCache`), então gravar
 * pedido de hoje não deixa nada velho — derrubar ali só joga fora o cache dos
 * meses encerrados, que é justamente o que segura as telas pesadas de pé.
 * Devolve se derrubou, pra quem chama poder registrar.
 */
export async function limparSeTocouMesFechado(
  tag: string,
  meses: Iterable<{ year: number; month: number }>,
): Promise<boolean> {
  for (const m of meses) {
    if (mesFechado(m.year, m.month)) {
      await limparCacheAgregados([tag])
      return true
    }
  }
  return false
}
