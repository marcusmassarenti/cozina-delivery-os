/**
 * O que cada plataforma traz SOZINHA pela API — e o que continua na planilha.
 *
 * ── POR QUE EXISTE (Marcus, 16/08/26) ────────────────────────────────────
 * A tabela de Unidades ganhou uma bolinha verde nas plataformas conectadas, e
 * o Marcus emendou: "entra sozinho mas não todos os dados, certo? deveríamos
 * avisar o que entra". Certíssimo — "conectado por API" sugere que a loja está
 * resolvida, e não está: no iFood, cardápio, qualidade, promoções e Super
 * continuam dependendo de alguém subir planilha todo mês. Um selo que promete
 * mais do que entrega é pior que selo nenhum, porque faz parar de conferir.
 *
 * ⚠️ ESTES DADOS FORAM MEDIDOS, NÃO SUPOSTOS. Saíram de `platform_imports`
 * (o que de fato entrou nos últimos 7 dias, agrupado por plataforma × tipo ×
 * origem), em 16/08/2026:
 *
 *   iFood       api → financeiro, pedidos, avaliações
 *               planilha → cardápio, qualidade, promoções, Super, negociações
 *   99 Food     api → financeiro, cardápio
 *               planilha → avaliações (a API da 99 não expõe)
 *   Cardápio Web  api → tudo (só existe por API)
 *   Keeta       planilha → tudo (não tem API)
 *
 * Se a cobertura mudar (a homologação de novos endpoints do iFood está em
 * andamento), é AQUI que muda — e a tela toda acompanha.
 */
import type { CanalId } from "@/components/platform-logo"

export type CoberturaApi = {
  /** O que entra sozinho. Vazio = nada entra por API. */
  porApi: string[]
  /** O que continua dependendo de importação manual. */
  porPlanilha: string[]
}

export const COBERTURA_API: Record<CanalId, CoberturaApi> = {
  ifood: {
    porApi: ["financeiro", "pedidos", "avaliações"],
    porPlanilha: ["cardápio", "qualidade", "promoções", "Super", "negociações"],
  },
  "99food": {
    porApi: ["financeiro", "cardápio"],
    porPlanilha: ["avaliações"],
  },
  cardapioweb: {
    porApi: ["financeiro", "pedidos", "cardápio", "avaliações", "clientes"],
    porPlanilha: [],
  },
  keeta: {
    porApi: [],
    porPlanilha: ["financeiro", "vendas", "cardápio", "promoções", "fatura"],
  },
}

const lista = (xs: string[]) =>
  xs.length <= 1
    ? (xs[0] ?? "")
    : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`

/**
 * Frase pro tooltip do logo. `conectada` é o estado DAQUELA loja — a mesma
 * plataforma pode estar conectada numa e não em outra, e o texto tem que
 * refletir a loja, não a plataforma em tese.
 */
export function textoCobertura(
  plataforma: CanalId,
  rotulo: string,
  conectada: boolean,
): string {
  const c = COBERTURA_API[plataforma]
  if (!conectada || c.porApi.length === 0) {
    return `${rotulo} · importação por planilha`
  }
  const base = `${rotulo} · entra sozinho: ${lista(c.porApi)}`
  return c.porPlanilha.length === 0
    ? `${base}. Nada depende de planilha.`
    : `${base}. Ainda por planilha: ${lista(c.porPlanilha)}.`
}
