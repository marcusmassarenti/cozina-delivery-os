import "server-only"

import { createHash } from "node:crypto"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import { isProPlan } from "@/lib/data/billing"
import { getOperacaoConsolidada } from "@/lib/data/operacao-consolidada"
import { getMonthlyGeneral } from "@/lib/data/lancamentos"
import { getComentariosNegativos } from "@/lib/data/avaliacoes-negativos"
import { getTopProdutos } from "@/lib/data/produtos"
import { askClaudeJson, diagnosticoModel } from "@/lib/anthropic/client"
import {
  getCardapioPeriodoForMonth,
  getFunnelForMonth,
  getNegociacoesForMonth,
  getOperacaoForMonth,
  getPromocoesForMonth,
  getSuperForMonth,
} from "@/lib/data/ifood-imported"

export type AcaoIA = {
  titulo: string
  problema: string
  emJogo: string
  comoFazer: string
  severidade: "alta" | "media" | "baixa"
}

export type PlanoIA = {
  resumo: string
  acoes: AcaoIA[]
  modelo: string | null
  geradoEm: string
}

// ─── Snapshot dos dados que alimentam a IA ───────────────────────────

/** Monta o retrato da loja no mês (só o que já temos importado) + um hash
 *  estável pra saber se o plano cacheado ainda corresponde aos dados. */
async function montarSnapshot(
  unitId: string,
  year: number,
  month: number,
  unitName: string,
) {
  const [
    funnel,
    periodo,
    operacao,
    promocoes,
    superAval,
    negociacoes,
    consol,
    geral,
    comentarios,
    topIf,
    top99,
    topKe,
  ] = await Promise.all([
    getFunnelForMonth(unitId, year, month),
    getCardapioPeriodoForMonth(unitId, year, month),
    getOperacaoForMonth(unitId, year, month),
    getPromocoesForMonth(unitId, year, month),
    getSuperForMonth(unitId, year, month),
    getNegociacoesForMonth(unitId, year, month),
    getOperacaoConsolidada(unitId, year, month),
    getMonthlyGeneral(unitId, year, month),
    getComentariosNegativos(year, month, [unitId], 2),
    getTopProdutos("ifood", [unitId], year, month, 15),
    getTopProdutos("99food", [unitId], year, month, 15),
    getTopProdutos("keeta", [unitId], year, month, 15),
  ])

  // CMV (manual) — só entra se foi lançado (senão o plano da IA acharia 0% ótimo).
  const cmvValor = geral.custoProdutosCozina + (geral.custoProdutosLoja || 0)
  const cmvPct =
    cmvValor > 0 && consol.total.bruto > 0
      ? (cmvValor / consol.total.bruto) * 100
      : null

  // Top produtos da operação: soma as 3 plataformas por nome do item.
  const prodMap = new Map<string, { item: string; qtd: number; valor: number }>()
  for (const p of [...topIf, ...top99, ...topKe]) {
    const chave = p.nomeItem.trim().toLowerCase()
    if (!chave) continue
    const cur = prodMap.get(chave)
    if (cur) {
      cur.qtd += p.qtdVendida
      cur.valor += p.valorTotal
    } else {
      prodMap.set(chave, {
        item: p.nomeItem.trim(),
        qtd: p.qtdVendida,
        valor: p.valorTotal,
      })
    }
  }
  const topProdutos = [...prodMap.values()]
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, 8)

  // Reclamações reais (texto do cliente, nota ≤ 2) — as piores primeiro.
  const reclamacoesTexto = comentarios.slice(0, 6).map((c) => ({
    nota: c.nota,
    plataforma: c.plataforma,
    texto: c.comentario.slice(0, 180),
  }))

  const funil = periodo ?? funnel
  const conversao =
    (periodo?.conversaoPct ?? (funnel.diasComDado > 0 ? funnel.conversaoPct : null))

  const round = (n: number) => Math.round(n * 100) / 100
  const snap = {
    loja: unitName,
    periodo: `${String(month).padStart(2, "0")}/${year}`,
    // A OPERAÇÃO INTEIRA (soma das plataformas que a loja usa).
    operacao_total: {
      faturamentoBruto: round(consol.total.bruto),
      pedidos: consol.total.pedidos,
      ticketMedio: round(consol.total.ticket),
    },
    por_plataforma: consol.plataformas
      .filter((p) => p.temDados)
      .map((p) => ({
        plataforma: p.label,
        faturamento: round(p.bruto),
        pedidos: p.pedidos,
        ticket: round(p.ticket),
        participacaoPct: round(p.sharePct),
        notaMedia: p.notaMedia ?? undefined,
        tempoPreparoMin: p.tempoPreparoMin ?? undefined,
        taxaAceitacaoPct: p.taxaAceitacaoPct ?? undefined,
      })),
    // Métricas PROFUNDAS abaixo existem só no iFood (marketplace).
    detalhe_ifood: {
      visitas: periodo?.visitas ?? (funnel.diasComDado > 0 ? funnel.visitas : null),
      conversaoPct: conversao,
    },
    funil_ifood: funil
      ? {
          visitas: funil.visitas,
          visualizacoes: funil.visualizacoes,
          sacola: funil.sacola,
          revisao: funil.revisao,
          concluidos: funil.concluidos,
          conversaoPct: funil.conversaoPct,
        }
      : null,
    operacao: operacao
      ? {
          nivelSuper: operacao.nivelSuper,
          tempoOnlinePct: operacao.pctTempoOnline,
          cancelamentoPct: operacao.pctCancelamento,
          chamadosPct: operacao.pctNegociacoes,
          tempoPreparoMin: operacao.tempoMedioPreparoMin,
          pedidosAtrasadosPct: operacao.pctAtrasados,
          notaMedia: operacao.mediaAvaliacoes,
          topMotivosCancelamento: operacao.topMotivosCancelamento,
        }
      : null,
    marketing: promocoes
      ? {
          investimentoLoja: promocoes.investimentoLojas,
          roas: promocoes.roasLojas,
          nCampanhas: promocoes.nCampanhas,
        }
      : null,
    sentimento: superAval
      ? {
          planoDeAcaoIfood: superAval.planoDeAcao,
          maisElogiados: topTags(superAval.tagsPos),
          maisReclamados: topTags(superAval.tagsNeg),
        }
      : null,
    negociacoes: negociacoes
      ? {
          total: negociacoes.totalNegociacoes,
          cancelamentosEvitados: negociacoes.cancelamentosEvitados,
          valorSalvo: negociacoes.valorEvitado,
          respondidasPct: negociacoes.pctRespondidas,
          topMotivos: topTags(negociacoes.topMotivos),
        }
      : null,
    // Custo da mercadoria vendida (manual). null = não lançado (não assuma 0%).
    cmv:
      cmvPct != null
        ? { valor: round(cmvValor), pctSobreFaturamento: round(cmvPct) }
        : null,
    // Itens mais vendidos da operação (soma das plataformas), por quantidade.
    top_produtos: topProdutos.map((p) => ({
      item: p.item,
      qtd: p.qtd,
      faturamento: round(p.valor),
    })),
    // Reclamações REAIS dos clientes (texto, nota ≤ 2) — a voz do cliente.
    reclamacoes_clientes: reclamacoesTexto,
  }

  const hash = createHash("sha1").update(JSON.stringify(snap)).digest("hex")
  return { snap, hash, temDados: consol.ativas > 0 || !!funil }
}

function topTags(m: Record<string, number>, n = 5): string[] {
  return Object.entries(m ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${k} (${v})`)
}

// ─── Leitura do plano cacheado ───────────────────────────────────────

export async function getDiagnosticoIA(
  unitId: string,
  year: number,
  month: number,
): Promise<PlanoIA | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("diagnostico_ia")
    .select("resumo, acoes, modelo, gerado_em")
    .eq("unit_id", unitId)
    .eq("ano", year)
    .eq("mes", month)
    .maybeSingle()
  if (!data) return null
  return {
    resumo: data.resumo ?? "",
    acoes: (data.acoes as AcaoIA[]) ?? [],
    modelo: data.modelo,
    geradoEm: data.gerado_em,
  }
}

// ─── Disponibilidade (plano Pro + toggle da conta) ───────────────────

export type IaStatus = {
  podeUsar: boolean
  /** null quando pode; senão o motivo do bloqueio. */
  motivo: null | "pro" | "off"
  holdingId: string | null
}

/** A IA é recurso do plano Pro E precisa estar ligada na conta. */
export async function getIaStatus(): Promise<IaStatus> {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { podeUsar: false, motivo: "off", holdingId: null }
  if (!(await isProPlan())) return { podeUsar: false, motivo: "pro", holdingId }
  const admin = createAdminClient()
  const { data } = await admin
    .from("holdings")
    .select("ia_habilitada")
    .eq("id", holdingId)
    .maybeSingle()
  if (!data?.ia_habilitada) return { podeUsar: false, motivo: "off", holdingId }
  return { podeUsar: true, motivo: null, holdingId }
}

// ─── Limite diário de chamadas (controle de custo) ───────────────────

/** Limite de gerações de IA por dia por conta (env IA_LIMITE_DIARIO). */
export function iaLimiteDiario(): number {
  const n = parseInt(process.env.IA_LIMITE_DIARIO ?? "", 10)
  return Number.isFinite(n) && n > 0 ? n : 100
}

/**
 * Confere o limite do dia e incrementa o contador. Lança se estourou —
 * assim ninguém fica apertando "Regenerar" e queimando tokens.
 */
export async function consumirCotaIA(holdingId: string): Promise<void> {
  const admin = createAdminClient()
  const dia = new Date().toISOString().slice(0, 10)
  const limite = iaLimiteDiario()

  const { data } = await admin
    .from("ia_usage")
    .select("chamadas")
    .eq("holding_id", holdingId)
    .eq("dia", dia)
    .maybeSingle()
  const usadas = data?.chamadas ?? 0
  if (usadas >= limite) {
    throw new Error(
      `Limite diário de IA atingido (${limite} gerações). Tente amanhã ou ajuste o limite.`,
    )
  }
  await admin
    .from("ia_usage")
    .upsert(
      { holding_id: holdingId, dia, chamadas: usadas + 1 },
      { onConflict: "holding_id,dia" },
    )
}

// ─── Geração (chama o Claude) ────────────────────────────────────────

const SYSTEM = `Você é um consultor de delivery experiente e direto, que fala português do Brasil pro DONO da loja — sem jargão, sem enrolação.

Recebe os dados REAIS da OPERAÇÃO de uma loja (todas as plataformas que ela usa: iFood, 99 Food, Keeta) e devolve um PLANO DE AÇÃO da operação como um todo. Regras:
- Use SOMENTE os números fornecidos. NUNCA invente dado que não está no JSON.
- Pense na operação inteira: "operacao_total" é a soma, "por_plataforma" é a quebra. As métricas profundas (funil, tempo online, chamados, Super) existem só no iFood — trate-as como iFood.
- Use "reclamacoes_clientes" (texto REAL do cliente) pra achar a CAUSA RAIZ dos problemas de qualidade — cite o padrão que se repete. Use "top_produtos" pra pensar em cardápio/destaque/upsell. Se "cmv" existir, avalie a margem; se "cmv" for null, NÃO comente CMV (não foi lançado — não assuma que está ótimo).
- EXATAMENTE as 3 ações mais importantes, da mais urgente pra menos. Operação saudável → foque em crescer.
- Seja CONCISO: cada campo em 1 frase curta (máx ~20 palavras). Cite o número real quando ajudar.
- Responda APENAS com JSON válido, sem texto fora dele:
{"resumo":"1 frase do foco prioritário","acoes":[{"titulo":"imperativo curto","problema":"","em_jogo":"","como_fazer":"","severidade":"alta|media|baixa"}]}`

type RespIA = {
  resumo?: string
  acoes?: {
    titulo?: string
    problema?: string
    em_jogo?: string
    como_fazer?: string
    severidade?: string
  }[]
}

export async function gerarDiagnosticoIA(
  unitId: string,
  year: number,
  month: number,
  unitName: string,
  userId: string | null,
): Promise<PlanoIA> {
  const { snap, hash, temDados } = await montarSnapshot(
    unitId,
    year,
    month,
    unitName,
  )
  if (!temDados) {
    throw new Error("Sem dados do iFood importados pra analisar essa loja.")
  }

  const modelo = diagnosticoModel()
  const resp = await askClaudeJson<RespIA>({
    system: SYSTEM,
    user: `Dados da loja (JSON):\n${JSON.stringify(snap, null, 2)}\n\nGere o plano de ação.`,
    maxTokens: 1600,
  })

  const acoes: AcaoIA[] = (resp.acoes ?? []).slice(0, 3).map((a) => ({
    titulo: String(a.titulo ?? "").trim(),
    problema: String(a.problema ?? "").trim(),
    emJogo: String(a.em_jogo ?? "").trim(),
    comoFazer: String(a.como_fazer ?? "").trim(),
    severidade:
      a.severidade === "alta" || a.severidade === "baixa"
        ? a.severidade
        : "media",
  }))
  const resumo = String(resp.resumo ?? "").trim()

  const admin = createAdminClient()
  await admin.from("diagnostico_ia").upsert(
    {
      unit_id: unitId,
      ano: year,
      mes: month,
      input_hash: hash,
      resumo,
      acoes,
      modelo,
      gerado_por: userId,
      gerado_em: new Date().toISOString(),
    },
    { onConflict: "unit_id,ano,mes" },
  )

  return { resumo, acoes, modelo, geradoEm: new Date().toISOString() }
}
