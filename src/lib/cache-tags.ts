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
import { rpcTodasAsLinhas } from "@/lib/data/paginate"
import {
  registrarFalhaDeLeitura,
  type PlataformaLeitura,
} from "@/lib/data/falhas-leitura"

/** Conciliação do iFood — tudo derivado de ifood_financeiro_lancamentos. */
export const TAG_FINANCEIRO_IFOOD = "ifood-financeiro"
/** Pedidos da 99 Food (webhook + planilha). */
export const TAG_99FOOD = "99food-pedidos"
/** Fatura e pedidos da Keeta. */
export const TAG_KEETA = "keeta-dados"
/** Pedidos e avaliações do Cardápio Web (sync, backfill, detalhe). */
export const TAG_CARDAPIOWEB = "cardapioweb-dados"
/** Avaliações do iFood (sync da API e planilha). */
export const TAG_AVALIACOES_IFOOD = "ifood-avaliacoes"

export const TODAS_AS_TAGS = [
  TAG_FINANCEIRO_IFOOD,
  TAG_99FOOD,
  TAG_KEETA,
  TAG_CARDAPIOWEB,
  TAG_AVALIACOES_IFOOD,
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
  /** Chave única de cada linha, pra paginar sem pular nem repetir. */
  ordem: string[] = ["unit_id"],
): Promise<{ data: T[] | null; error: string | null }> {
  const chamar = async () => {
    // Todas as páginas, não só a primeira: rede grande passa de 1000 linhas
    // (ver `rpcTodasAsLinhas`).
    const { data, error } = await rpcTodasAsLinhas<T>((from, to) => {
      let q = createAdminClient().rpc(nome, {
        p_unit_ids: unitIds,
        p_year: year,
        p_month: month,
      })
      for (const c of ordem) q = q.order(c)
      return q.range(from, to) as unknown as PromiseLike<{
        data: T[] | null
        error: { message: string } | null
      }>
    })
    return { data: data ?? null, error: error?.message ?? null }
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
    // "paginado" na chave: as entradas antigas foram gravadas com só as
    // primeiras 1000 linhas e valeriam mais 24h — chave nova descarta todas.
    [nome, "paginado", `${year}-${month}-${[...unitIds].sort().join(",")}`],
    { tags: [tag], revalidate: 86_400 },
  )().catch((e) => ({
    data: null,
    error: e instanceof Error ? e.message : String(e),
  }))
}

/** Leitura que terminou com falha: devolve o parcial, mas não entra no cache. */
class LeituraParcial extends Error {
  constructor(
    readonly falhas: string[],
    readonly parcial: unknown,
  ) {
    super("leitura parcial")
    this.name = "LeituraParcial"
  }
}

/**
 * Qualquer agregado de mês FECHADO com cache — o mesmo contrato do
 * `rpcMensalComCache`, pra quem monta o número em JS (Marcus, 25/09/26:
 * "focar na fluidez"; o Gráfico de Evolução pede o ano inteiro a cada
 * abertura do Dashboard, e só o iFood ficava guardado).
 *
 *  • Mês corrente nunca entra: ainda muda sozinho.
 *  • LEITURA COM FALHA NÃO ENTRA. `calcular` recebe um `falhas[]`; se algo
 *    cair ali, o parcial vai pra tela (com o aviso de sempre) e a próxima
 *    requisição tenta de novo — a lição de julho/26 da Pinheiros, quando um
 *    erro guardado por 24 h tirou o iFood inteiro do mês sem ninguém ver.
 *  • Se o PRÓPRIO cache falhar, calcula direto: cache é atalho, não pode
 *    derrubar tela.
 *
 * O valor tem que ser JSON puro (Map vira `[...map.entries()]` antes). A
 * chave leva as lojas ORDENADAS e o recorte de dias: o mesmo mês pedido pra
 * outro conjunto de lojas ou outro recorte é outra resposta.
 *
 * Quem grava em mês fechado derruba as `tags` (ver `limparSeTocouMesFechado`).
 */
export async function mesFechadoComCache<T>(opts: {
  nome: string
  unitIds: string[] | undefined
  year: number
  month: number
  /** "mes" ou "AAAA-MM-DD..AAAA-MM-DD". */
  recorte?: string
  tags: string[]
  calcular: (falhas: string[]) => Promise<T>
  /** Do chamador: recebe o que falhou (mesmo com cache no caminho). */
  falhas?: string[]
  /** Pra reavisar a tela quando a falha acontece dentro do cache. */
  plataforma?: PlataformaLeitura
}): Promise<T> {
  const { year, month } = opts
  if (!mesFechado(year, month)) return opts.calcular(opts.falhas ?? [])

  const lojas = opts.unitIds ? [...opts.unitIds].sort().join(",") : "todas"
  try {
    return await unstable_cache(
      async () => {
        const f: string[] = []
        const r = await opts.calcular(f)
        if (f.length > 0) throw new LeituraParcial(f, r)
        return r
      },
      [opts.nome, "v1", `${year}-${month}`, opts.recorte ?? "mes", lojas],
      { tags: opts.tags, revalidate: 86_400 },
    )()
  } catch (e) {
    if (e instanceof LeituraParcial) {
      opts.falhas?.push(...e.falhas)
      if (opts.plataforma) registrarFalhaDeLeitura(opts.plataforma)
      return e.parcial as T
    }
    console.error(`[cache] ${opts.nome} ${year}-${month}: calculando sem cache —`, e)
    return opts.calcular(opts.falhas ?? [])
  }
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
