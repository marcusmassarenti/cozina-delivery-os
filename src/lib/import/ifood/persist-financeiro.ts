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

  const { count: existingCount, error: countErr } = await admin
    .from("ifood_financeiro_lancamentos")
    .select("id", { count: "exact", head: true })
    .eq("unit_id", unit.unitId)
    .in("competencia", competencias.length > 0 ? competencias : ["__none__"])

  // ⚠️ Erro nesta contagem NÃO pode virar zero.
  //
  // Ela decidia se a carga antiga seria apagada. Quando o count estourava o
  // statement timeout — o que acontece justamente nas lojas de mais volume — o
  // erro era ignorado, `existingCount` virava null, o código concluía "não
  // tinha nada aqui" e NÃO apagava. A carga nova entrava por cima da antiga e
  // o mês ficava contado duas vezes.
  //
  // Foi o que aconteceu com a Yakisushi e a Churras Popular em 31/07: 49% de
  // linhas duplicadas, líquido maior que o bruto, e o cliente reclamando de um
  // número que estava mesmo errado.
  if (countErr) {
    throw new Error(
      `Não consegui contar a carga anterior (${countErr.message}). Abortado: gravar sem saber o que já existe duplica o mês.`,
    )
  }
  const substituido = (existingCount ?? 0) > 0

  // ⚠️ TRAVA DE REGRESSÃO.
  //
  // Este bloco apaga o mês inteiro e regrava. Se a fonte devolver um extrato
  // truncado — e o iFood devolve, quando a conciliação ainda está sendo
  // processada do lado dele — o mês bom é trocado por um pedaço, em silêncio.
  //
  // (Correção: em 29/07/26 eu culpei o extrato do iFood pela perda da JK. Não
  // era. O parser leu as 20.702 linhas nas duas vezes — quem truncou em 5.000
  // foi o nosso próprio insert, e é isso que a ordem grava-confere-apaga lá
  // embaixo resolve. Esta trava continua aqui pro caso legítimo de o extrato
  // vir mesmo curto, mas ela NÃO era a defesa que faltava.)
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

  // ⚠️ O log nasce como "partial" e só vira "success" DEPOIS que as linhas
  // estão no banco e conferidas.
  //
  // Antes ele era gravado como "success" com a contagem do PARSER, e o apaga-
  // e-regrava vinha logo em seguida. Em 29/07/26 a JK e a Jardins perderam o
  // mês assim: o parser leu 20.702 linhas, o log jurou 20.702, o mês antigo foi
  // apagado e o insert morreu no primeiro chunk — sobraram exatamente 5.000
  // linhas (1 chunk) e nenhum erro em lugar nenhum. R$ 161 mil sumiram do
  // Faturamento Bruto da rede com o histórico dizendo "sucesso".
  //
  // Ou seja: o extrato do iFood nunca veio truncado. Nós é que truncamos.
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
      status: "partial",
      rows_imported: 0,
    })
    .select("id")
    .single()
  if (ilErr) throw new Error(`Falha ao criar log: ${ilErr.message}`)

  // Restos de uma carga que morreu no meio (log "partial") não podem contar
  // como dado. Somem antes de qualquer coisa — inclusive antes da nova carga,
  // pra que o mês nunca fique somado duas vezes.
  //
  // ⚠️ SÓ NAS COMPETÊNCIAS QUE ESTA EXECUÇÃO VAI REESCREVER. Sem esse recorte
  // a limpeza apaga resto de mês que ninguém pediu — e como a carga nova
  // desse mês não vem, o dado some de vez.
  //
  // Foi exatamente o que aconteceu em 09/08/26 na Hortolândia: um sync manual
  // morreu no meio da troca de julho, e no dia seguinte o backfill das
  // competências 02 a 06 apagou os restos de JULHO, que aquela execução nem
  // estava tocando. Resultado: 17 dias de julho perdidos, com o log da
  // importação dizendo `success` e nenhum erro em lugar nenhum.
  const { data: incompletos } = await admin
    .from("platform_imports")
    .select("id")
    .eq("unit_id", unit.unitId)
    .eq("platform", "ifood")
    .eq("report_type", "financeiro")
    .eq("status", "partial")
    .neq("id", importLog.id)
    // 30 min de folga pra não matar uma carga que ainda esteja rodando em
    // paralelo (duas abas, cron + botão manual).
    .lt("imported_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
  const idsIncompletos = (incompletos ?? []).map((r) => r.id as string)
  if (idsIncompletos.length > 0) {
    await admin
      .from("ifood_financeiro_lancamentos")
      .delete()
      .eq("unit_id", unit.unitId)
      .in("competencia", competencias)
      .in("import_id", idsIncompletos)
  }

  // Conciliação do iFood tem MUITOS lançamentos (7k+ por loja/mês, 21k nas
  // maiores). O limite aqui NÃO é round-trip, é o statement_timeout de 8s que
  // o Supabase põe no papel `authenticator` — e o `service_role` não o
  // sobrescreve.
  //
  // Era 5000 e passava, até a ordem virar grava→confere→apaga: agora a carga
  // nova e a antiga convivem na tabela durante a gravação, cada insert
  // mantém 7 índices num volume dobrado, e as 4 maiores lojas começaram a
  // estourar os 8s (JK, Cardeal, Brooklin, Jardins, em 31/07). 1000 dá folga
  // de sobra e custa alguns round-trips a mais.
  const CHUNK = 1000
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

  // A ORDEM É O QUE PROTEGE O MÊS: grava a carga nova inteira, confere, e só
  // então apaga a antiga. Se qualquer chunk falhar (ou a função for morta por
  // timeout no meio), o mês antigo ainda está lá inteiro — o pior caso vira
  // "sobrou lixo de uma carga partial", que a própria rodada seguinte limpa,
  // em vez de "o mês foi apagado e não voltou".
  const abortar = async (motivo: string): Promise<never> => {
    await admin
      .from("ifood_financeiro_lancamentos")
      .delete()
      .eq("unit_id", unit.unitId)
      .eq("import_id", importLog.id)
    await admin
      .from("platform_imports")
      .update({ status: "error", error_message: motivo.slice(0, 500) })
      .eq("id", importLog.id)
    throw new Error(motivo)
  }

  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const { error } = await admin
      .from("ifood_financeiro_lancamentos")
      .insert(slice)
    if (error) {
      await abortar(
        `Falha ao gravar lançamentos (chunk ${i / CHUNK + 1} de ${Math.ceil(
          rows.length / CHUNK,
        )}): ${error.message}`,
      )
    }
  }

  // Conferência de verdade: conta no banco o que deveria ter entrado. É esta
  // linha que teria pego a JK — o insert "não deu erro", só não gravou tudo.
  const { count: gravadas } = await admin
    .from("ifood_financeiro_lancamentos")
    .select("id", { count: "exact", head: true })
    .eq("unit_id", unit.unitId)
    .eq("import_id", importLog.id)
  if ((gravadas ?? 0) !== rows.length) {
    await abortar(
      `Carga incompleta: o banco gravou ${gravadas ?? 0} de ${rows.length} linhas. O mês anterior foi preservado.`,
    )
  }

  // Agora sim: fora a carga antiga (tudo que é da mesma competência e não
  // veio deste import).
  // Roda SEMPRE, não só quando `substituido`. Se a contagem lá em cima errar
  // pra menos por qualquer motivo, o delete ainda limpa — e apagar "nada" é
  // barato. Depender do flag foi o que deixou o mês duplicado passar.
  //
  // Apaga em páginas pelo mesmo motivo do insert: um DELETE de 20 mil linhas
  // com 7 índices não cabe nos 8s de statement_timeout. Em 30/07 a Sushi Bar
  // caiu exatamente aqui ("Falha ao remover a carga antiga: statement
  // timeout"), e nesse ponto o mês já tinha as duas cargas na tabela — que é
  // o pior lugar pra parar.
  //
  // Lote menor que o do insert porque aqui o limite é OUTRO: os ids viajam na
  // URL do PostgREST. Com 1000 UUIDs a requisição passa de 35 KB e volta "Bad
  // Request" antes de chegar no banco.
  // TRAVA: não apaga a carga antiga sem a nova estar inteira na tabela.
  //
  // O laço abaixo não é transacional — morreu no meio, fica metade apagada e
  // sem rastro. Em 08/08/26 isso custou 17 dias de julho na Hortolândia: a
  // exclusão rodou UMA página de 200 e o processo caiu.
  //
  // Conferir antes não impede a queda no meio do laço, mas impede o caso
  // pior, que é apagar tendo gravado só parte — aí a antiga vai embora e a
  // nova não existe pra substituir. É barato: um count.
  {
    const { count: novasNaTabela } = await admin
      .from("ifood_financeiro_lancamentos")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", unit.unitId)
      .eq("import_id", importLog.id)
    if ((novasNaTabela ?? 0) < rows.length) {
      await abortar(
        `Carga nova incompleta (${novasNaTabela ?? 0} de ${rows.length}) — ` +
          `a antiga fica no lugar. Rode de novo.`,
      )
    }
  }

  {
    const DELETE_CHUNK = 200
    for (;;) {
      const { data: velhas, error: selErr } = await admin
        .from("ifood_financeiro_lancamentos")
        .select("id")
        .eq("unit_id", unit.unitId)
        .in("competencia", competencias)
        // `neq` sozinho não pega linha com import_id nulo (comparação com NULL
        // é NULL, não "diferente") — e linha antiga sem import_id existe.
        .or(`import_id.is.null,import_id.neq.${importLog.id}`)
        .limit(DELETE_CHUNK)
      if (selErr) {
        await abortar(`Falha ao localizar a carga antiga: ${selErr.message}`)
      }
      if (!velhas || velhas.length === 0) break

      const { error: delErr } = await admin
        .from("ifood_financeiro_lancamentos")
        .delete()
        .in(
          "id",
          velhas.map((v) => v.id),
        )
      if (delErr) {
        await abortar(`Falha ao remover a carga antiga: ${delErr.message}`)
      }
    }
  }

  await admin
    .from("platform_imports")
    .update({ status: "success", rows_imported: rows.length })
    .eq("id", importLog.id)

  // Derruba o cache dos meses fechados. O dashboard guarda o agregado de mês
  // encerrado por 24h — e reimportação é justamente o caso em que um mês
  // encerrado muda. Sem esta linha, a recuperação de junho de 29/07 teria
  // corrigido o banco e o painel continuaria mostrando o número quebrado.
  const { limparCacheAgregados } = await import("@/lib/cache-tags")
  await limparCacheAgregados()

  return {
    substituido,
    rowsImported: rows.length,
    jaExistia: existingCount ?? 0,
    importId: importLog.id as string,
  }
}
