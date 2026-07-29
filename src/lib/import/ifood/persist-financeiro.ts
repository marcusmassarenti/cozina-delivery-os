/**
 * Persistência do financeiro do iFood em `ifood_financeiro_lancamentos`.
 *
 * Fonte única de verdade pros DOIS caminhos que gravam financeiro:
 *   1. Importação manual de XLSX/CSV (`/importacao` → saveFinanceiro)
 *   2. Sync automático via API de Reconciliation (cron `ifood-sync`)
 *
 * Ambos chegam num `ParsedFinanceiro` (mesmo formato, mesmas colunas) e usam
 * esta função pra gravar — garantindo que API e planilha produzam dados
 * idênticos no banco.
 *
 * Idempotência: dedupe POR COMPETÊNCIA (não pelo mês do cabeçalho). Apaga os
 * lançamentos existentes da(s) competência(s) presentes no parse e regrava.
 * Reimportar o mesmo período não duplica — e o sync diário pode rodar à
 * vontade que sempre converge pro estado mais recente do iFood.
 */
import "server-only"

import type { createAdminClient } from "@/lib/supabase/admin"

import type { ParsedFinanceiro } from "./types"

type Admin = ReturnType<typeof createAdminClient>

export type PersistFinanceiroSource = {
  /** Nome do arquivo (manual) ou rótulo da origem (ex.: "API Reconciliation 2026-06"). */
  filename: string
  /** Usuário que disparou (manual) ou null (cron/automático). */
  importedBy: string | null
  /** Cadência do log — manual é "mensal", o sync também trata competência mensal. */
  cadencia?: string
}

export type PersistFinanceiroResult = {
  /** true se já havia lançamentos da competência (foram substituídos). */
  substituido: boolean
  /**
   * Preenchido quando a carga foi RECUSADA por trazer muito menos lançamentos
   * que a anterior. Nada foi apagado; o mês antigo continua de pé.
   */
  regressaoBloqueada?: { anterior: number; recebido: number; queda: number }
  /** Quantidade de linhas gravadas. */
  rowsImported: number
  /** Quantas linhas da(s) competência(s) JÁ existiam antes desta gravação.
   *  0 = competência nova (dado 100% novo). >0 = refresh (delta = gravadas − essas). */
  jaExistia: number
  /** id do registro em platform_imports (auditoria). */
  importId: string
}

/** "2026-05-01" → "2026-05-01" (date-only, sem timezone). */
function formatDateOnly(d: Date | null): string | null {
  if (!d) return null
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function toIso(d: Date | null): string | null {
  return d ? d.toISOString() : null
}

/**
 * Grava os lançamentos financeiros parseados na tabela, de forma idempotente
 * por competência. Lança erro em falha de banco (o caller decide se aborta
 * tudo ou só registra a falha daquela loja).
 */
export async function persistFinanceiro(
  parsed: ParsedFinanceiro,
  unit: { unitId: string; code?: string; name?: string },
  source: PersistFinanceiroSource,
  admin: Admin,
): Promise<PersistFinanceiroResult> {
  // Dedupe POR COMPETÊNCIA: um arquivo/competência-mensal pode trazer
  // lançamentos de meses vizinhos (o iFood mistura repasses). A coluna
  // 'competencia' é a chave de período confiável do schema.
  const competencias = [
    ...new Set(parsed.lancamentos.map((l) => l.competencia)),
  ].filter(Boolean)

  const { count: existingCount } = await admin
    .from("ifood_financeiro_lancamentos")
    .select("id", { count: "exact", head: true })
    .eq("unit_id", unit.unitId)
    .in("competencia", competencias.length > 0 ? competencias : ["__none__"])
  const substituido = (existingCount ?? 0) > 0

  // ⚠️ TRAVA DE REGRESSÃO.
  //
  // Este bloco apaga o mês inteiro e regrava. Se a fonte devolver um extrato
  // truncado — e o iFood devolve, quando a conciliação ainda está sendo
  // processada do lado dele — o mês bom é trocado por um pedaço, em silêncio.
  //
  // Aconteceu em 29/07/26 com a JK: o cron das 06:28 recebeu 5.000 linhas em
  // vez de 20.702 e o Faturamento Bruto da rede caiu R$ 119 mil. Reprocessar
  // meia hora depois trouxe as 20.702 — ou seja, o dado nunca se perdeu; nós
  // é que aceitamos a resposta ruim como verdade.
  //
  // Regra: encolher é suspeito, crescer não. Uma queda acima de 30% não
  // substitui nada — mantém o que já existe e devolve o aviso pra quem chamou.
  // O limite é folgado de propósito: cancelamento e estorno mudam a contagem
  // legitimamente, e travar carga boa é tão ruim quanto aceitar carga ruim.
  const anterior = existingCount ?? 0
  const novas = parsed.lancamentos.length
  const encolheuDemais = anterior > 0 && novas < anterior * 0.7
  if (encolheuDemais) {
    return {
      substituido: false,
      rowsImported: 0,
      jaExistia: anterior,
      importId: "",
      regressaoBloqueada: {
        anterior,
        recebido: novas,
        queda: Math.round((1 - novas / anterior) * 100),
      },
    }
  }

  const { data: importLog, error: ilErr } = await admin
    .from("platform_imports")
    .insert({
      unit_id: unit.unitId,
      platform: "ifood",
      report_type: "financeiro",
      cadencia: source.cadencia ?? "mensal",
      ref_year: parsed.refYear,
      ref_month: parsed.refMonth,
      source_filename: source.filename,
      imported_by: source.importedBy,
      status: "success",
      rows_imported: parsed.lancamentos.length,
    })
    .select("id")
    .single()
  if (ilErr) throw new Error(`Falha ao criar log: ${ilErr.message}`)

  if (substituido) {
    await admin
      .from("ifood_financeiro_lancamentos")
      .delete()
      .eq("unit_id", unit.unitId)
      .in("competencia", competencias)
  }

  // Conciliação do iFood tem MUITOS lançamentos (7k+ por loja/mês). Chunks
  // grandes cortam os round-trips ao Postgres — o gargalo é o volume.
  const CHUNK = 5000
  const rows = parsed.lancamentos.map((l) => ({
    unit_id: unit.unitId,
    competencia: l.competencia,
    ref_year: l.refYear,
    ref_month: l.refMonth,
    data_fato_gerador: toIso(l.dataFatoGerador),
    fato_gerador: l.fatoGerador,
    tipo_lancamento: l.tipoLancamento,
    descricao_lancamento: l.descricaoLancamento,
    valor: l.valor,
    base_calculo: l.baseCalculo,
    percentual_taxa: l.percentualTaxa,
    valor_transacao: l.valorTransacao,
    valor_cesta_inicial: l.valorCestaInicial,
    valor_cesta_final: l.valorCestaFinal,
    pedido_associado_ifood: l.pedidoAssociadoIfood,
    pedido_associado_ifood_curto: l.pedidoAssociadoIfoodCurto,
    pedido_associado_externo: l.pedidoAssociadoExterno,
    motivo_cancelamento: l.motivoCancelamento,
    descricao_ocorrencia: l.descricaoOcorrencia,
    data_criacao_pedido: toIso(l.dataCriacaoPedido),
    data_repasse_esperada: formatDateOnly(l.dataRepasseEsperada),
    data_faturamento: toIso(l.dataFaturamento),
    data_apuracao_inicio: formatDateOnly(l.dataApuracaoInicio),
    data_apuracao_fim: formatDateOnly(l.dataApuracaoFim),
    responsavel_transacao: l.responsavelTransacao,
    canal_vendas: l.canalVendas,
    impacto_no_repasse: l.impactoNoRepasse,
    parcela_pagamento: l.parcelaPagamento,
    id_saldo: l.idSaldo,
    import_id: importLog.id,
  }))

  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const { error } = await admin
      .from("ifood_financeiro_lancamentos")
      .insert(slice)
    if (error) {
      throw new Error(
        `Falha ao gravar lançamentos (chunk ${i / CHUNK + 1}): ${error.message}`,
      )
    }
  }

  return {
    substituido,
    rowsImported: rows.length,
    jaExistia: existingCount ?? 0,
    importId: importLog.id as string,
  }
}
