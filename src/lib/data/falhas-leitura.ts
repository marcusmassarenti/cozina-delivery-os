import "server-only"

import { cache } from "react"

/**
 * Quais leituras de plataforma FALHARAM durante a montagem desta tela.
 *
 * ── POR QUE EXISTE (Marcus, 17/09/26 — opção A de 30/07/26) ─────────────
 * Leitura que falhava virava número pela metade com cara de total, e ninguém
 * sabia. A decisão foi mostrar o número COM uma marca do lado ("parcial"), em
 * vez de quebrar o card — um soluço do banco não pode derrubar o painel.
 *
 * ── POR QUE UM COLETOR, E NÃO UM PARÂMETRO ───────────────────────────────
 * O Início e a página da unidade chegam às mesmas leituras por uns dez
 * caminhos (mês inteiro, período, uma loja só, a conta do mês…). Passar
 * "onde anoto a falha" por todos eles mexeria em dezenas de assinaturas. O
 * `cache()` do React vale por REQUISIÇÃO: toda leitura desta renderização
 * anota no mesmo conjunto, e a página só pergunta no fim.
 *
 * Fora de uma renderização (cron, script) o `cache` não guarda nada entre
 * chamadas — a anotação simplesmente se perde, e nada quebra. Quem precisa
 * da falha fora de tela usa o parâmetro `falhas` das leituras.
 */
export type PlataformaLeitura = "iFood" | "99" | "Keeta"

const coletor: () => Set<PlataformaLeitura> =
  typeof cache === "function"
    ? cache(() => new Set<PlataformaLeitura>())
    : () => new Set<PlataformaLeitura>()

/** Anota que a leitura desta plataforma não terminou (depois das tentativas). */
export function registrarFalhaDeLeitura(plataforma: PlataformaLeitura): void {
  try {
    coletor().add(plataforma)
  } catch {
    // Sem contexto de requisição: não há tela pra avisar.
  }
}

/** As plataformas cuja leitura falhou nesta requisição, em ordem fixa. */
export function falhasDeLeituraDaRequisicao(): PlataformaLeitura[] {
  try {
    const s = coletor()
    return (["iFood", "99", "Keeta"] as const).filter((p) => s.has(p))
  } catch {
    return []
  }
}

const COM_ARTIGO: Record<PlataformaLeitura, string> = {
  iFood: "do iFood",
  "99": "da 99",
  Keeta: "da Keeta",
}

/**
 * A frase do aviso, ou null quando veio tudo. Diz QUAL leitura faltou e o que
 * fazer — "algo deu errado" faria o dono desconfiar de todos os números.
 */
export function avisoDeLeituraParcial(
  falhas: PlataformaLeitura[],
): string | null {
  if (falhas.length === 0) return null
  const partes = falhas.map((f) => COM_ARTIGO[f])
  const lista =
    partes.length === 1
      ? partes[0]
      : `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`
  return `A leitura ${lista} não terminou agora — os números marcados como parcial podem estar abaixo do real. Recarregue a página em instantes.`
}
