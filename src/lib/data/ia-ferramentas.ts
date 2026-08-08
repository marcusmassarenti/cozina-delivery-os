import "server-only"

/**
 * FERRAMENTAS do Nino — dados que ele busca sob demanda.
 *
 * Por que ferramenta e não contexto: o levantamento de 05/ago/26 mostrou que o
 * sistema tem ~50 módulos de dados e o Nino enxergava 10. A resposta óbvia
 * seria empilhar tudo no JSON de contexto, mas isso custa janela e dinheiro em
 * TODA pergunta — inclusive nas que não precisam de nada disso ("qual meu
 * faturamento?"). Ferramenta inverte a conta: o bloco pesado só é buscado
 * quando a pergunta pede.
 *
 * O que continua no contexto fixo é o que quase toda conversa usa (faturamento,
 * histórico, cancelamento, reputação). O resto mora aqui.
 *
 * REGRA DE OURO destes handlers: NUNCA lançar. Uma ferramenta que estoura
 * derruba a resposta inteira e o dono vê "algo deu errado" numa pergunta que o
 * Nino sabia responder pela metade. Erro vira `{ erro: "..." }` — texto que o
 * modelo consegue explicar.
 */
import type { FerramentaIa } from "@/lib/anthropic/client"
import type { PlatformId } from "@/components/platform-logo"
import { PLATAFORMAS } from "@/components/platform-logo"

import { getTopProdutos } from "@/lib/data/produtos"
import { getCaixaSummary, getCaixaHoldingId } from "@/lib/data/caixa"
import { getFluxoCaixa } from "@/lib/data/fluxo-caixa"
import { getAging } from "@/lib/data/aging"
import { getDreGerencial } from "@/lib/data/dre-gerencial"
import { getNetworkResultadoForMonth } from "@/lib/data/resultado"
import {
  getNetworkFunnelForMonth,
  getOperacaoForMonth,
  getSuperForMonth,
  getNegociacoesForMonth,
} from "@/lib/data/ifood-imported"
import { getNetworkPagamentoResumo } from "@/lib/data/ifood-pedidos"
import { getOperacaoCardapioWeb } from "@/lib/data/cardapioweb-operacao"
import { getKeetaRepasseResumo } from "@/lib/data/keeta-repasses"
import { getDemandaInsumos } from "@/lib/data/producao"
import { getLastSyncedDates } from "@/lib/data/sync-status"

type Unidade = { id: string; name: string }

/** Arredonda pra centavo — número gigante com 12 casas só gasta token. */
const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Embrulha o handler: qualquer exceção vira erro legível.
 *
 * Sem isso, uma tabela vazia num cliente novo (ou uma RPC que estourou o
 * timeout, como já aconteceu na conciliação) derrubaria a conversa inteira.
 */
function seguro(
  nome: string,
  fn: (input: Record<string, string>) => Promise<unknown>,
): (input: Record<string, unknown>) => Promise<string> {
  return async (bruto: Record<string, unknown>) => {
    // O modelo às vezes manda número onde o schema pede string. Normalizar
    // aqui evita um `.toLowerCase is not a function` derrubar a resposta.
    const input = Object.fromEntries(
      Object.entries(bruto ?? {}).map(([k, v]) => [k, v == null ? "" : String(v)]),
    ) as Record<string, string>
    try {
      return JSON.stringify(await fn(input))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[nino:${nome}]`, msg)
      return JSON.stringify({
        erro: `Não consegui buscar ${nome} agora. Responda o que der com o resto do contexto e diga que esse pedaço falhou.`,
      })
    }
  }
}

/** Lê ano/mês do input com o mês corrente como padrão. */
function periodo(
  input: Record<string, string>,
  padrao: { year: number; month: number },
) {
  const y = Number(input.ano)
  const m = Number(input.mes)
  const ok = Number.isInteger(y) && Number.isInteger(m) && m >= 1 && m <= 12
  return ok ? { year: y, month: m } : padrao
}

const PROP_PERIODO = {
  ano: { type: "string", description: "Ano (ex.: 2026). Omita pro mês atual." },
  mes: { type: "string", description: "Mês 1-12. Omita pro mês atual." },
} as const

export function ferramentasDoNino(
  units: Unidade[],
  mesAtual: { year: number; month: number },
): FerramentaIa[] {
  const unitIds = units.map((u) => u.id)

  return [
    {
      name: "produtos_vendidos",
      description:
        "Itens vendidos por loja/rede no mês: quanto cada produto faturou, quantas unidades saíram e a variação contra o mês anterior. Use pra 'produto mais vendido', 'o que caiu de venda', 'top 10 itens', 'qual item cresceu', 'o que parou de vender'. Cobre as 4 plataformas.",
      input_schema: {
        type: "object",
        properties: {
          ...PROP_PERIODO,
          plataforma: {
            type: "string",
            description:
              "ifood, 99food, keeta ou cardapioweb. Omita pra somar todas.",
          },
        },
        required: [],
      },
      run: seguro("os produtos vendidos", async (input) => {
        const { year, month } = periodo(input, mesAtual)
        const alvo = (
          PLATAFORMAS.includes(input.plataforma as PlatformId)
            ? [input.plataforma as PlatformId]
            : PLATAFORMAS
        ) as PlatformId[]
        const listas = await Promise.all(
          alvo.map((p) => getTopProdutos(p, unitIds, year, month, 60)),
        )
        // Soma o MESMO produto entre plataformas: pro dono "Yakisoba" é um
        // produto só, não um por canal.
        const acc = new Map<
          string,
          { valor: number; qtd: number; valorAnt: number }
        >()
        listas.flat().forEach((p) => {
          const chave = String(
            (p as { nome?: string; nomeItem?: string }).nome ??
              (p as { nomeItem?: string }).nomeItem ??
              "",
          )
          if (!chave) return
          const rec = p as unknown as Record<string, number>
          const cur = acc.get(chave) ?? { valor: 0, qtd: 0, valorAnt: 0 }
          cur.valor += Number(rec.valor ?? rec.valorTotal ?? 0)
          cur.qtd += Number(rec.qtd ?? rec.qtdVendida ?? 0)
          cur.valorAnt += Number(rec.valorAnterior ?? 0)
          acc.set(chave, cur)
        })
        const totalGeral = [...acc.values()].reduce((t, v) => t + v.valor, 0)
        const linhas = [...acc.entries()]
          .map(([nome, v]) => ({
            produto: nome,
            faturamento: r2(v.valor),
            unidades: v.qtd,
            // Participação PRONTA. Sem ela o modelo dizia "representa uma
            // fatia significativa das suas vendas" — adjetivo no lugar de
            // número, justamente na frase de conclusão que o dono lê. Ele
            // tinha como dividir, mas depois da regra de não somar ficou
            // conservador demais. Melhor entregar o percentual do que torcer.
            pct_do_faturamento_de_itens:
              totalGeral > 0 ? r2((v.valor / totalGeral) * 100) : null,
            variacao_pct:
              v.valorAnt > 0 ? r2((v.valor / v.valorAnt - 1) * 100) : null,
          }))
          .sort((a, b) => b.faturamento - a.faturamento)
        // Somas PRONTAS. O modelo somava de cabeça e errava: a mesma pergunta
        // devolveu R$ 61.522,11 numa vez e R$ 59.522,85 na outra, quando o
        // certo era R$ 59.522,91 — R$ 1.999 de erro no primeiro caso. Somar é
        // trabalho de servidor; número que o dono leva pra decisão não pode
        // depender de aritmética mental do modelo.
        const somar = (n: number) =>
          r2(linhas.slice(0, n).reduce((acc, l) => acc + l.faturamento, 0))
        return {
          periodo: `${String(month).padStart(2, "0")}/${year}`,
          plataformas: alvo,
          total_de_itens: linhas.length,
          soma_top_5: somar(5),
          soma_top_10: somar(10),
          soma_top_20: somar(20),
          faturamento_de_todos_os_itens: somar(linhas.length),
          top_20: linhas.slice(0, 20),
          // Quedas só valem com base de comparação; sem mês anterior a
          // variação é null e o item não deve aparecer como "caiu".
          maiores_quedas: linhas
            .filter((l) => l.variacao_pct !== null && l.variacao_pct < 0)
            .sort((a, b) => (a.variacao_pct ?? 0) - (b.variacao_pct ?? 0))
            .slice(0, 10),
        }
      }),
    },

    {
      name: "financeiro_e_caixa",
      description:
        "Dinheiro em caixa HOJE, contas a pagar e a receber, valores vencidos e a projeção de saldo dos próximos dias (já com os repasses previstos de iFood, 99 e Keeta). Use pra 'tenho como pagar X', 'quanto tenho em caixa', 'o que vence essa semana', 'vou ficar no vermelho', 'quanto tenho a receber'. É o módulo Caixa — só responde se o cliente usar.",
      input_schema: {
        type: "object",
        properties: {
          ...PROP_PERIODO,
          dias: {
            type: "string",
            description: "Horizonte da projeção em dias (padrão 30).",
          },
        },
        required: [],
      },
      run: seguro("o financeiro", async (input) => {
        const { year, month } = periodo(input, mesAtual)
        const holdingId = await getCaixaHoldingId()
        if (!holdingId)
          return { erro: "Este cliente não usa o módulo Caixa/Financeiro." }
        const horizonte = Math.min(
          90,
          Math.max(7, Number(input.dias) || 30),
        )
        const [resumo, fluxo, aging] = await Promise.all([
          getCaixaSummary(holdingId, year, month),
          getFluxoCaixa(horizonte),
          getAging(),
        ])
        return {
          periodo: `${String(month).padStart(2, "0")}/${year}`,
          caixa_do_mes: resumo,
          projecao: fluxo
            ? {
                horizonte_dias: fluxo.horizonteDias,
                saldo_hoje: fluxo.saldoAtual,
                saldo_projetado_fim: fluxo.saldoProjetadoFim,
                saldo_minimo_no_periodo: fluxo.saldoMinimo,
                // O dado mais acionável da tela: se existir, é alerta.
                primeiro_dia_negativo: fluxo.primeiroDiaNegativo,
                entradas_de_delivery: fluxo.totalEntradasDelivery,
                entradas_manuais: fluxo.totalEntradasManual,
                saidas: fluxo.totalSaidas,
                vencido_a_pagar: fluxo.atrasadoPagar,
                vencido_a_receber: fluxo.atrasadoReceber,
              }
            : null,
          vencidos_por_faixa: aging,
        }
      }),
    },

    {
      name: "dre_e_resultado",
      description:
        "Estrutura de resultado: receita, custos por grupo (DRE gerencial) e o resultado da rede por plataforma, com repasse e margem. Use pra 'qual meu lucro', 'onde estou gastando', 'DRE do mês', 'qual plataforma dá mais resultado', 'minha margem'.",
      input_schema: {
        type: "object",
        properties: { ...PROP_PERIODO },
        required: [],
      },
      run: seguro("o DRE", async (input) => {
        const { year, month } = periodo(input, mesAtual)
        const [dre, resultado] = await Promise.all([
          getDreGerencial(year, month),
          getNetworkResultadoForMonth(year, month, unitIds),
        ])
        return {
          periodo: `${String(month).padStart(2, "0")}/${year}`,
          dre_gerencial: dre ?? "cliente não usa o módulo Caixa",
          resultado_da_rede: resultado,
        }
      }),
    },

    {
      name: "funil_e_perfil_de_venda",
      description:
        "Como o cliente compra: funil de conversão do iFood (visitas → sacola → pedido), horário de pico, tipo de pedido (entrega/retirada), forma de pagamento e VR por bandeira. Use pra 'por que caiu se a nota está boa', 'qual meu horário de pico', 'quantos pagam no PIX', 'minha conversão', 'quanto é retirada'.",
      input_schema: {
        type: "object",
        properties: {
          ...PROP_PERIODO,
          loja: {
            type: "string",
            description:
              "Nome da loja pra ver o perfil dela. Omita pro consolidado da rede.",
          },
        },
        required: [],
      },
      run: seguro("o funil", async (input) => {
        const { year, month } = periodo(input, mesAtual)
        const alvo = input.loja
          ? units.find((u) =>
              u.name.toLowerCase().includes(input.loja.toLowerCase()),
            )
          : null
        const [funil, pagamento, cw, operacao] = await Promise.all([
          getNetworkFunnelForMonth(year, month, unitIds),
          getNetworkPagamentoResumo(year, month, unitIds),
          getOperacaoCardapioWeb(unitIds, year, month),
          alvo ? getOperacaoForMonth(alvo.id, year, month) : null,
        ])
        return {
          periodo: `${String(month).padStart(2, "0")}/${year}`,
          funil_ifood: funil,
          formas_de_pagamento_ifood: pagamento,
          canal_proprio: cw,
          perfil_da_loja: alvo
            ? { loja: alvo.name, operacao_ifood: operacao }
            : "peça informando a loja pra ver horário de pico e tipo de pedido",
        }
      }),
    },

    {
      name: "programas_e_repasses",
      description:
        "Programas do iFood (Super Restaurante e Negociações/planos) e os repasses da Keeta. Use pra 'sou Super?', 'como subo de nível no iFood', 'qual meu plano de comissão', 'quanto a Keeta me repassou'. Programas do iFood são por LOJA — informe a loja.",
      input_schema: {
        type: "object",
        properties: {
          ...PROP_PERIODO,
          loja: { type: "string", description: "Nome da loja." },
        },
        required: [],
      },
      run: seguro("os programas", async (input) => {
        const { year, month } = periodo(input, mesAtual)
        const alvo = input.loja
          ? units.find((u) =>
              u.name.toLowerCase().includes(input.loja.toLowerCase()),
            )
          : null
        const [keeta, sup, neg] = await Promise.all([
          getKeetaRepasseResumo(year, month),
          alvo ? getSuperForMonth(alvo.id, year, month) : null,
          alvo ? getNegociacoesForMonth(alvo.id, year, month) : null,
        ])
        return {
          periodo: `${String(month).padStart(2, "0")}/${year}`,
          repasses_keeta: keeta,
          loja: alvo?.name ?? null,
          super_restaurante: alvo
            ? sup
            : "informe a loja — Super é por unidade",
          negociacoes_ifood: alvo
            ? neg
            : "informe a loja — o plano é por unidade",
        }
      }),
    },

    {
      name: "producao_e_insumos",
      description:
        "Demanda de insumos derivada do que foi vendido, via ficha técnica. Use pra 'quanto de carne vou precisar', 'quanto comprar', 'demanda de embalagem'. Só funciona se o cliente tiver ficha técnica cadastrada.",
      input_schema: {
        type: "object",
        properties: { ...PROP_PERIODO },
        required: [],
      },
      run: seguro("a produção", async (input) => {
        const { year, month } = periodo(input, mesAtual)
        const d = await getDemandaInsumos(year, month, unitIds)  // holding vem da sessão do chat
        return { periodo: `${String(month).padStart(2, "0")}/${year}`, ...d }
      }),
    },

    {
      name: "status_das_integracoes",
      description:
        "Até quando cada plataforma trouxe dado, por loja. Use pra 'meus dados estão atualizados?', 'até quando importou', 'a conexão está funcionando', 'por que o número está velho'.",
      input_schema: { type: "object", properties: {}, required: [] },
      run: seguro("o status das integrações", async () => {
        const s = await getLastSyncedDates()
        return {
          ultima_sincronizacao_por_plataforma: s,
          lojas: units.length,
          nota:
            "Data é do último dado recebido, não da última tentativa. Plataforma sem API (Keeta e relatórios de portal do iFood) depende de planilha subida à mão.",
        }
      }),
    },
  ] as FerramentaIa[]
}
