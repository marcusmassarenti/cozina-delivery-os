import "server-only"

/**
 * Agrupa o diagnóstico de saúde POR LOJA e separa o que mudou hoje do que já
 * estava parado.
 *
 * O diagnóstico nasce por (loja × plataforma) — que é a granularidade certa
 * pra decidir, mas errada pra ler. Hoje a Duéle Hamburgueria ocupa duas linhas
 * do e-mail, uma pro 99 e outra pra Keeta, dizendo a mesma coisa.
 *
 * ⚠️ O PROBLEMA REAL É ESCALA, e ele já está medido: com 75 lojas o relatório
 * tem 158 linhas possíveis, das quais 87 são "plataforma marcada no cadastro
 * que nunca conectou" — 55% do e-mail é cadastro, não falha. Em 500 lojas
 * viram ~1.050 linhas. Nenhum agrupamento salva um e-mail desse tamanho.
 *
 * Por isso a régua aqui não é só agrupar, é separar por TEMPO:
 *   • parou hoje  → aberto, com nome e logo. É a notícia.
 *   • segue parado → agrupado por cliente, com teto. Já foi notícia ontem.
 *   • nunca conectou → uma linha e uma contagem. É fila de cadastro.
 * Assim o e-mail tem tamanho ~constante, não importa se a base tem 75 ou 500.
 */
import type { PlatformId } from "@/components/platform-logo"

import type { Gravidade, LojaSaude } from "./saude-integracoes"

/** Uma loja com problema, já com todas as plataformas afetadas juntas. */
export type LojaAgrupada = {
  unitId: string
  cliente: string
  code: string
  loja: string
  plataformas: PlatformId[]
  /** A pior gravidade entre as plataformas da loja. */
  gravidade: Gravidade
  /** Dia em que o dado parou (o dia seguinte ao último sinal). */
  desde: string | null
  /** Último pedido registrado, em qualquer plataforma da loja. */
  ultimoPedido: string | null
  /** Dias parados. null = nunca teve dado. */
  dias: number | null
  /** Cruzou o limiar nas últimas 24h — ou seja, é notícia de hoje. */
  novoHoje: boolean
  /** Motivo da plataforma mais grave, pra quando precisar detalhar. */
  motivo: string
  /**
   * O QUE parou — e as duas coisas não são a mesma.
   *
   * "parada" = a loja não registra pedido novo (parou de vender, ou parou de
   * importar). "financeiro" = a loja está vendendo normalmente, mas o dinheiro
   * daquelas vendas não chegou. A segunda é muito mais comum e assusta menos.
   */
  tipo: "parada" | "financeiro" | "nunca"
  /** Último dia com dado financeiro — usado quando o tipo é "financeiro". */
  ultimoFinanceiro: string | null
}

export type GrupoCliente = {
  cliente: string
  lojas: LojaAgrupada[]
  /** Dias da loja parada há mais tempo neste cliente. */
  piorDias: number | null
}

export type SaudeAgrupada = {
  /** Cruzaram o limiar nas últimas 24h. Vão abertas no e-mail. */
  pararamHoje: GrupoCliente[]
  /** Já estavam paradas ontem. Vão agrupadas, com teto por cliente. */
  seguemParadas: GrupoCliente[]
  /** Marcação de plataforma no cadastro que nunca recebeu dado. */
  nuncaConectou: { total: number; clientes: number }
  totalPararamHoje: number
  totalSeguemParadas: number
}

const DIA_MS = 86_400_000

/** "2026-08-06" ou ISO → dias inteiros até agora, no fuso de São Paulo. */
function diasDesde(quando: string, agora: Date): number {
  const base = quando.includes("T") ? quando : `${quando}T23:59:59-03:00`
  return Math.floor((agora.getTime() - new Date(base).getTime()) / DIA_MS)
}

/** O dia seguinte ao último sinal — quando o silêncio começou. */
function diaSeguinte(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00-03:00`)
  return new Date(d.getTime() + DIA_MS).toISOString().slice(0, 10)
}

const PIOR: Record<Gravidade, number> = { alerta: 0, atencao: 1, ok: 2 }

export function agruparSaude(
  lojas: LojaSaude[],
  agora = new Date(),
): SaudeAgrupada {
  // "Nunca recebeu dado" sai da lista de problemas e vira contagem. Não é
  // falha de integração: é loja que marcou a plataforma no cadastro e nunca
  // autorizou. Misturado com os defeitos reais, ele os enterra.
  const semDadoNunca = lojas.filter(
    (l) => l.gravidade !== "ok" && !l.conectada && !l.ultimoPedido,
  )
  const problemas = lojas.filter(
    (l) => l.gravidade !== "ok" && !(!l.conectada && !l.ultimoPedido),
  )

  const porLoja = new Map<string, LojaAgrupada>()
  for (const l of problemas) {
    const cur = porLoja.get(l.unitId)

    /* ⚠️ A ÂNCORA DO "DESDE" DEPENDE DO QUE PAROU.
     *
     * A primeira versão ancorava sempre no último pedido, e o e-mail saiu
     * dizendo "Hulk Burguer — desde 09/08" num dia 08/08: data no futuro, numa
     * loja que tinha vendido naquela manhã. O que estava atrasado nela era o
     * financeiro, não a venda.
     *
     * Então: se a loja vendeu DEPOIS do último dado financeiro, o que falta é
     * o dinheiro daquelas vendas, e a conta corre a partir do financeiro. Se
     * não há venda nova, aí sim o marco é o último pedido. */
    const vendendo =
      Boolean(l.ultimoPedido) &&
      Boolean(l.ultimoFinanceiro) &&
      l.ultimoFinanceiro!.slice(0, 10) < l.ultimoPedido!
    const tipo: LojaAgrupada["tipo"] = vendendo
      ? "financeiro"
      : l.ultimoPedido || l.ultimoFinanceiro
        ? "parada"
        : "nunca"
    const sinal = vendendo ? l.ultimoFinanceiro : (l.ultimoPedido ?? l.ultimoFinanceiro)

    if (!cur) {
      porLoja.set(l.unitId, {
        unitId: l.unitId,
        cliente: l.cliente,
        code: l.code,
        loja: l.loja,
        plataformas: [l.plataforma as PlatformId],
        gravidade: l.gravidade,
        desde: sinal ? diaSeguinte(sinal) : null,
        ultimoPedido: l.ultimoPedido,
        ultimoFinanceiro: l.ultimoFinanceiro,
        dias: sinal ? diasDesde(sinal, agora) : null,
        novoHoje: false,
        motivo: l.motivo,
        tipo,
      })
      continue
    }
    if (!cur.plataformas.includes(l.plataforma as PlatformId)) {
      cur.plataformas.push(l.plataforma as PlatformId)
    }
    if (PIOR[l.gravidade] < PIOR[cur.gravidade]) {
      cur.gravidade = l.gravidade
      cur.motivo = l.motivo
      cur.tipo = tipo
    }
    if (sinal) {
      // A plataforma menos atrasada manda no "desde": se o iFood parou ontem
      // e a Keeta há 10 dias, a loja está parcialmente viva — datar pelo pior
      // faria parecer abandono total.
      const d = diasDesde(sinal, agora)
      if (cur.dias === null || d < cur.dias) {
        cur.dias = d
        cur.desde = diaSeguinte(sinal)
      }
      if (!cur.ultimoPedido || (l.ultimoPedido && l.ultimoPedido > cur.ultimoPedido)) {
        cur.ultimoPedido = l.ultimoPedido
      }
      if (
        !cur.ultimoFinanceiro ||
        (l.ultimoFinanceiro && l.ultimoFinanceiro > cur.ultimoFinanceiro)
      ) {
        cur.ultimoFinanceiro = l.ultimoFinanceiro
      }
    }
  }

  /* "Parou hoje" = cruzou o limiar nas últimas 24h.
   *
   * Derivado do próprio dado, sem tabela de estado: o alerta acende com 2 dias
   * de silêncio, então quem está EM 2 dias acendeu agora. Tem um custo
   * conhecido: se o relatório não rodar num dia, a loja daquele dia aparece
   * direto em "segue parado" e nunca em "parou hoje". Aceito — ela continua no
   * e-mail, só não ganha o destaque. O contrário (guardar estado só pra isso)
   * é uma tabela nova pra sustentar uma linha de texto. */
  const NOVO_ATE_DIAS = 2
  for (const l of porLoja.values()) {
    l.novoHoje = l.dias !== null && l.dias <= NOVO_ATE_DIAS
  }

  const agrupar = (ls: LojaAgrupada[]): GrupoCliente[] => {
    const porCliente = new Map<string, LojaAgrupada[]>()
    for (const l of ls) {
      const arr = porCliente.get(l.cliente) ?? []
      arr.push(l)
      porCliente.set(l.cliente, arr)
    }
    return [...porCliente.entries()]
      .map(([cliente, lojas]) => ({
        cliente,
        // Mais antiga primeiro: parada há 12 dias é pior que parada há 3,
        // independente do tamanho da loja.
        lojas: lojas.sort((a, b) => (b.dias ?? 9999) - (a.dias ?? 9999)),
        piorDias: lojas.reduce<number | null>(
          (m, l) => (l.dias === null ? m : Math.max(m ?? 0, l.dias)),
          null,
        ),
      }))
      .sort((a, b) => (b.piorDias ?? 9999) - (a.piorDias ?? 9999))
  }

  const todas = [...porLoja.values()]
  const novas = todas.filter((l) => l.novoHoje)
  const antigas = todas.filter((l) => !l.novoHoje)

  return {
    pararamHoje: agrupar(novas),
    seguemParadas: agrupar(antigas),
    nuncaConectou: {
      total: semDadoNunca.length,
      clientes: new Set(semDadoNunca.map((l) => l.cliente)).size,
    },
    totalPararamHoje: novas.length,
    totalSeguemParadas: antigas.length,
  }
}
