/**
 * Parser do relatório de Avaliações (Comentários) do iFood.
 *
 * Aba única "Página 1" — 26 colunas:
 *   Data do pedido, Nome da marca, Nome da loja, ID do Merchant,
 *   ID da loja, Serviço logístico, ID curto do pedido, ID longo do pedido,
 *   Status do pedido, Data da avaliação, Nota,
 *   Tag: Comida saborosa | Bem temperada | Boa quantidade | Boa aparência |
 *   Boa embalagem | Bons ingredientes | Temperatura certa | No ponto certo |
 *   Embalagem sustentável | Pedido incompleto | Itens vieram errados |
 *   Itens danificados | Mal embalado,
 *   Comentário, Status da avaliação
 */

import * as XLSX from "xlsx"

import type { ParsedAvaliacoes, ParsedAvaliacao } from "./types"
import {
  parseDateOnlyMaybe,
  parseIsoDateMaybe,
  toNumberOrNull,
  toStringOrNull,
} from "./utils"

// Quais colunas são tags e qual a polaridade
const POSITIVE_TAGS = [
  "Comida saborosa",
  "Bem temperada",
  "Boa quantidade",
  "Boa aparência",
  "Boa embalagem",
  "Bons ingredientes",
  "Temperatura certa",
  "No ponto certo",
  "Embalagem sustentável",
] as const

const NEGATIVE_TAGS = [
  "Pedido incompleto",
  "Itens vieram errados",
  "Itens danificados",
  "Mal embalado",
] as const

export function parseIfoodAvaliacoes(workbook: XLSX.WorkBook): ParsedAvaliacoes {
  // O iFood gera com "Página 1" mas a gente é defensivo
  const sheetName =
    workbook.SheetNames.find((n) => n === "Página 1") ??
    workbook.SheetNames.find((n) => /pagina/i.test(n)) ??
    workbook.SheetNames[0]
  if (!sheetName) throw new Error("Nenhuma aba encontrada no XLSX")

  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
  })
  if (rows.length === 0) {
    throw new Error("Aba de avaliações está vazia")
  }

  // O XLSX pode ter avaliações de várias lojas. Agrupamos por ID da loja.
  const grupos = new Map<
    string,
    { storeName: string | null; avaliacoes: ParsedAvaliacao[] }
  >()

  for (const row of rows) {
    const storeId = String(row["ID da loja"] ?? "").trim()
    if (!storeId) continue

    const nota = toNumberOrNull(row["Nota"])
    if (nota == null || nota < 1 || nota > 5) continue
    const dataAvaliacao = parseDateOnlyMaybe(row["Data da avaliação"])
    if (!dataAvaliacao) continue

    const tagsPositivas: string[] = []
    const tagsNegativas: string[] = []
    for (const tag of POSITIVE_TAGS) {
      const v = String(row[`Tag: ${tag}`] ?? "").trim().toLowerCase()
      if (v === "sim" || v === "true" || v === "1") tagsPositivas.push(tag)
    }
    for (const tag of NEGATIVE_TAGS) {
      const v = String(row[`Tag: ${tag}`] ?? "").trim().toLowerCase()
      if (v === "sim" || v === "true" || v === "1") tagsNegativas.push(tag)
    }

    const avaliacao: ParsedAvaliacao = {
      pedidoIdCurto: toStringOrNull(row["ID curto do pedido"]),
      pedidoIdLongo: toStringOrNull(row["ID longo do pedido"]),
      dataPedido: parseIsoDateMaybe(row["Data do pedido"]),
      statusPedido: toStringOrNull(row["Status do pedido"]),
      servicoLogistico: toStringOrNull(row["Serviço logístico"]),
      dataAvaliacao,
      nota,
      comentario: toStringOrNull(row["Comentário"]),
      statusAvaliacao: toStringOrNull(row["Status da avaliação"]),
      tagsPositivas,
      tagsNegativas,
    }

    const grupo = grupos.get(storeId) ?? {
      storeName: toStringOrNull(row["Nome da loja"]),
      avaliacoes: [],
    }
    grupo.avaliacoes.push(avaliacao)
    if (!grupo.storeName) {
      grupo.storeName = toStringOrNull(row["Nome da loja"])
    }
    grupos.set(storeId, grupo)
  }

  if (grupos.size === 0) {
    throw new Error("Nenhuma avaliação válida encontrada no arquivo")
  }

  return {
    reportType: "avaliacoes",
    porLoja: Array.from(grupos.entries()).map(([storeId, g]) => ({
      storeId,
      storeName: g.storeName,
      avaliacoes: g.avaliacoes,
    })),
  }
}
