/**
 * Parser do relatório "Loja diária" do Keeta (File A).
 * 1 linha = 1 loja × 1 dia. Multi-loja/multi-dia → agrupa por storeId.
 */

import * as XLSX from "xlsx"
import { fixSheetRange, readHeader } from "./detect"
import type { ParsedKeetaLoja, ParsedKeetaLojaDia } from "./types"
import {
  parseCompactDate,
  toNumber,
  toNumberOrNull,
  toStoreId,
  toStringOrNull,
} from "./utils"

const REQUIRED = ["Data", "ID do restaurante", "Nome da loja"] as const

export function parseKeetaLoja(workbook: XLSX.WorkBook): ParsedKeetaLoja {
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error("XLSX sem abas.")
  const sheet = workbook.Sheets[sheetName]
  fixSheetRange(sheet)
  const headers = readHeader(sheet)

  for (const col of REQUIRED) {
    if (!headers.includes(col)) {
      throw new Error(
        `Coluna obrigatória "${col}" não encontrada. Confirma se é o relatório "Loja diária" do Keeta.`,
      )
    }
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
  })
  if (rows.length === 0) throw new Error("Relatório vazio (só cabeçalho).")

  type Bucket = {
    storeId: string
    storeName: string | null
    dias: ParsedKeetaLojaDia[]
  }
  const buckets = new Map<string, Bucket>()

  for (const r of rows) {
    const storeId = toStoreId(r["ID do restaurante"])
    if (!storeId) continue

    let data: Date
    try {
      data = parseCompactDate(r["Data"])
    } catch (e) {
      throw new Error(
        `Linha com data inválida (loja ${storeId}): ${e instanceof Error ? e.message : String(e)}`,
      )
    }

    const storeName = toStringOrNull(r["Nome da loja"])

    const dia: ParsedKeetaLojaDia = {
      data,
      vendasItens: toNumber(r["Vendas de itens"]),
      pedidosValidos: Math.round(toNumber(r["Pedidos válidos"])),
      totalPedidos: Math.round(toNumber(r["Total de pedidos"])),
      pedidosCancelados: Math.round(toNumber(r["Pedidos cancelados"])),
      valorMedioPedido: toNumber(r["Valor médio do pedido"]),
      alcanceClientes: roundOrNull(toNumberOrNull(r["Alcance de clientes"])),
      visitantes: roundOrNull(toNumberOrNull(r["Visitantes da loja"])),
      addCarrinho: roundOrNull(
        toNumberOrNull(r["Clientes que adicionaram ao carrinho"]),
      ),
      clientesFinalizados: roundOrNull(
        toNumberOrNull(r["Clientes com compras finalizadas"]),
      ),
      taxaConvExposicaoVisita: toNumberOrNull(
        r["Taxa de conversão de exposição em visita"],
      ),
      taxaConvVisitaCarrinho: toNumberOrNull(
        r["Taxa de conversão de visita em adição ao carrinho"],
      ),
      vendasPromocao: toNumberOrNull(r["Vendas de promoção de itens"]),
      numCampanhas: roundOrNull(toNumberOrNull(r["Número de campanhas"])),
      despesaUnidade: toNumberOrNull(r["Despesa (unidade)"]),
      tempoAbertoH: toNumberOrNull(r["Tempo aberto (h)"]),
      tempoPreparoMin: toNumberOrNull(r["Tempo de preparo"]),
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

  if (buckets.size === 0) throw new Error("Nenhuma linha válida no relatório.")

  return {
    reportType: "loja",
    porLoja: Array.from(buckets.values()).map((b) => ({
      ...b,
      dias: b.dias.sort((a, b) => a.data.getTime() - b.data.getTime()),
    })),
  }
}

function roundOrNull(n: number | null): number | null {
  return n == null ? null : Math.round(n)
}
