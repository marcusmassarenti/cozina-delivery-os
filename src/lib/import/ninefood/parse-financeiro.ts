/**
 * Parser do relatório "Dados da loja" do 99 Food.
 *
 * Cada linha = 1 loja × 1 dia, agregada.
 * Um único XLSX pode trazer N lojas × N dias — agrupamos por storeId.
 *
 * Como o usuário escolhe quais métricas marcar no painel do 99 Food,
 * o número de colunas varia. Lemos por NOME de coluna (não por índice)
 * pra ser robusto à configuração.
 */

import * as XLSX from "xlsx"
import { readHeader } from "./detect"
import type {
  ParsedNinefoodDadosLoja,
  ParsedNinefoodLojaDia,
} from "./types"
import {
  formatDateOnly,
  parseIsoDate,
  toNumber,
  toNumberOrNull,
  toPercent,
  toStoreId,
  toStringOrNull,
} from "./utils"

// Colunas EXIGIDAS (sem elas não dá pra agregar)
const REQUIRED_COLS = [
  "Data",
  "Nome do estabelecimento",
  "ID do loja",
] as const

// Colunas OPCIONAIS — guardamos só as que tiverem
const OPTIONAL_COLS = {
  total_vendas: "Total de vendas realizadas",
  bruto: "Receita total de vendas",
  liquido: "Receita total",
  ticket_medio: "Valor médio dos pedidos",
  comissao: "Despesas de comissão da loja",
  taxa_canal_pgto: "Taxa de canal de pagamento da loja",
  promocoes: "Despesas de ofertas da loja",
  avaliacao: "Avaliação da loja",
  taxa_aceitacao: "Taxa de Aceitação (TA)",
  cancelamentos: "Cancelamentos por parte do comerciante",
  tempo_preparo: "Tempo médio de preparo (minutos)",
} as const

export function parseNinefoodDadosLoja(
  workbook: XLSX.WorkBook,
): ParsedNinefoodDadosLoja {
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error("XLSX sem abas.")
  }
  const sheet = workbook.Sheets[sheetName]
  const headers = readHeader(sheet)

  // Valida obrigatórias
  for (const col of REQUIRED_COLS) {
    if (!headers.includes(col)) {
      throw new Error(
        `Coluna obrigatória "${col}" não encontrada no relatório. ` +
          `Verifica se você baixou "Dados da loja" com as métricas padrão marcadas.`,
      )
    }
  }

  // Mapa nome → índice
  const idx = new Map<string, number>()
  headers.forEach((h, i) => idx.set(h, i))

  // Lê todas as linhas como objetos (chave = header)
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false, // mantém strings, não vira number — pra ID da loja ficar string
  })

  if (rows.length === 0) {
    throw new Error(
      "O relatório está vazio (só o cabeçalho). Confirma o período e as lojas selecionadas no painel do 99 Food.",
    )
  }

  // Agrupa por storeId
  type Bucket = {
    storeId: string
    storeName: string | null
    dias: ParsedNinefoodLojaDia[]
  }
  const buckets = new Map<string, Bucket>()

  for (const r of rows) {
    const storeId = toStoreId(r["ID do loja"])
    if (!storeId) continue // linha sem id, ignora

    const dataRaw = r["Data"]
    let data: Date
    try {
      data = parseIsoDate(dataRaw)
    } catch (e) {
      throw new Error(
        `Linha com data inválida (loja ${storeId}): ${e instanceof Error ? e.message : String(e)}`,
      )
    }

    const storeName = toStringOrNull(r["Nome do estabelecimento"])
    const cidade = toStringOrNull(r["Cidade"])

    const dia: ParsedNinefoodLojaDia = {
      storeId,
      storeName,
      cidade,
      data,
      pedidos: Math.round(toNumber(r[OPTIONAL_COLS.total_vendas])),
      bruto: toNumber(r[OPTIONAL_COLS.bruto]),
      liquido: toNumber(r[OPTIONAL_COLS.liquido]),
      ticketMedio: toNumber(r[OPTIONAL_COLS.ticket_medio]),
      comissaoRs: toNumber(r[OPTIONAL_COLS.comissao]),
      taxaCanalPagamentoRs: toNumber(r[OPTIONAL_COLS.taxa_canal_pgto]),
      promocoesRs: toNumber(r[OPTIONAL_COLS.promocoes]),
      // Opcionais — null se a coluna não veio
      avaliacaoLoja: headers.includes(OPTIONAL_COLS.avaliacao)
        ? toNumberOrNull(r[OPTIONAL_COLS.avaliacao])
        : null,
      taxaAceitacaoPct: headers.includes(OPTIONAL_COLS.taxa_aceitacao)
        ? toPercent(r[OPTIONAL_COLS.taxa_aceitacao])
        : null,
      cancelamentosQtd: headers.includes(OPTIONAL_COLS.cancelamentos)
        ? roundOrNull(toNumberOrNull(r[OPTIONAL_COLS.cancelamentos]))
        : null,
      tempoMedioPreparoMin: headers.includes(OPTIONAL_COLS.tempo_preparo)
        ? roundOrNull(toNumberOrNull(r[OPTIONAL_COLS.tempo_preparo]))
        : null,
    }

    let bucket = buckets.get(storeId)
    if (!bucket) {
      bucket = { storeId, storeName, dias: [] }
      buckets.set(storeId, bucket)
    } else if (!bucket.storeName && storeName) {
      bucket.storeName = storeName
    }
    bucket.dias.push(dia)
  }

  if (buckets.size === 0) {
    throw new Error("Nenhuma linha válida no relatório.")
  }

  return {
    reportType: "dados_loja",
    porLoja: Array.from(buckets.values()).map((b) => ({
      ...b,
      dias: b.dias.sort((a, b) => a.data.getTime() - b.data.getTime()),
    })),
  }
}

/** Helper: extrai (ref_year, ref_month) a partir da data. */
export function refFromData(d: Date): { refYear: number; refMonth: number } {
  return { refYear: d.getFullYear(), refMonth: d.getMonth() + 1 }
}

/** Arredonda mantendo null. Usado em campos integer no DB. */
function roundOrNull(n: number | null): number | null {
  return n == null ? null : Math.round(n)
}

/** Re-export pra conveniência da action. */
export { formatDateOnly }
