/**
 * Parser do "Relatório de Vendas" do iFood (resumo agregado por loja).
 *
 * Esse relatório NÃO traz dado novo — os mesmos números chegam no
 * Relatório de Conciliação detalhado. Mas ele vem com TODAS as lojas
 * da rede num só arquivo, e o operador precisa saber quais lojas
 * estão no arquivo pra conferir cobertura.
 *
 * O parser só lê a aba "Vendas" (resumo). Agrega por Id da loja
 * (mescla Entrega parceira + Retirada em uma linha por loja).
 */

import * as XLSX from "xlsx"
import type { ParsedVendasResumo, ParsedVendasStore } from "./types"

/** Remove R$, espaços e vírgulas (formato US: "R$ 73,886.05" → 73886.05). */
function parseValor(raw: unknown): number {
  if (raw == null) return 0
  const s = String(raw).replace(/R\$|\s/g, "").replace(/,/g, "")
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

/** "1,099" → 1099 (vírgula como separador de milhar). */
function parsePedidos(raw: unknown): number {
  if (raw == null) return 0
  const s = String(raw).replace(/[,.\s]/g, "")
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : 0
}

export function parseIfoodVendas(workbook: XLSX.WorkBook): ParsedVendasResumo {
  const sheet = workbook.Sheets["Vendas"]
  if (!sheet) {
    return { reportType: "vendas", period: null, stores: [] }
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw: false,
    defval: null,
  })

  const byStore = new Map<string, ParsedVendasStore>()
  let period: string | null = null

  for (const r of rows) {
    const storeId = String(r["Id da loja"] ?? "").trim()
    if (!storeId) continue
    if (!period) {
      const p = String(r["Período"] ?? "").trim()
      if (p) period = p
    }
    const name = String(r["Nome da loja"] ?? "").trim() || storeId
    const city = (() => {
      const c = String(r["Cidade"] ?? "").trim()
      return c.length > 0 ? c : null
    })()
    const pedidos = parsePedidos(r["Total de vendas (pedidos)"])
    const valor = parseValor(r["Valor total de vendas"])

    const acc = byStore.get(storeId)
    if (acc) {
      acc.pedidos += pedidos
      acc.valor += valor
    } else {
      byStore.set(storeId, {
        storeId,
        storeName: name,
        city,
        pedidos,
        valor,
      })
    }
  }

  const stores = Array.from(byStore.values()).sort(
    (a, b) => b.valor - a.valor,
  )

  return { reportType: "vendas", period, stores }
}
