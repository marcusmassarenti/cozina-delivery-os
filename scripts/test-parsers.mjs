/**
 * Teste rápido dos parsers iFood com os arquivos reais do Marcus.
 * Roda com: node scripts/test-parsers.mjs
 *
 * Não usa o parser TS diretamente (pra evitar TS-Node) — replica a
 * lógica essencial só pra validar que XLSX abre + dados batem.
 */
import * as XLSX from "xlsx"
import fs from "node:fs"

const files = [
  {
    label: "Cardapio - DIA único (27/05)",
    path: "/Users/marcusmassarenti/Downloads/relatorio-cardápio_7f7e8cf90f1ea1cbd1e8bb026b92725710043cbcd568cb8ed53f04e89e639837.xlsx",
    expectedType: "cardapio",
  },
  {
    label: "Cardapio - SEMANA (21-27/05)",
    path: "/Users/marcusmassarenti/Downloads/relatorio-cardápio_2041c32d4243a497379fb405ec02eb74be7a5863a689e21a576954cca2af7815.xlsx",
    expectedType: "cardapio",
  },
  {
    label: "Financeiro - competencia 2026-05",
    path: "/Users/marcusmassarenti/Downloads/Churrasco no Pote - 260777 - portal-external-reconciliation-report-competencia=2026-05:loja_id=e4e44094-e913-43dc-ab99-722c7f4c07d1.xlsx",
    expectedType: "financeiro",
  },
]

function detectType(wb) {
  const s = new Set(wb.SheetNames)
  if (s.has("Relatório de Conciliação")) return "financeiro"
  const hasFunil = s.has("Funil Loja") || s.has("Funil Marca")
  if (hasFunil && s.has("Itens") && s.has("Complementos")) return "cardapio"
  return "unknown"
}

for (const f of files) {
  console.log("\n" + "=".repeat(70))
  console.log(f.label)
  console.log("=".repeat(70))
  const buf = fs.readFileSync(f.path)
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true })
  const t = detectType(wb)
  console.log(`  Detectado: ${t} (esperado: ${f.expectedType})`)
  console.log(`  Abas: ${wb.SheetNames.join(" | ")}`)

  if (t === "cardapio") {
    const funilName = wb.SheetNames.find((n) => n === "Funil Loja") ?? wb.SheetNames.find((n) => n === "Funil Marca")
    const funil = XLSX.utils.sheet_to_json(wb.Sheets[funilName], { defval: null })[0]
    const itens = XLSX.utils.sheet_to_json(wb.Sheets["Itens"], { defval: null })
    const comps = XLSX.utils.sheet_to_json(wb.Sheets["Complementos"], { defval: null })
    console.log(`  Período: ${funil["Período"]}`)
    console.log(`  Loja: ${funil["Id da Loja"]} (${funil["Nome da Loja"]})`)
    console.log(`  Funil: Visitas=${funil["Visitas"]}, Concluídos=${funil["Concluídos"]}, Conversão=${(funil["Conversão"] ?? 0).toFixed(2)}%`)
    console.log(`  Itens: ${itens.length} | Valor Total somado: R$ ${itens.reduce((a, r) => a + (r["Valor Total"] ?? 0), 0).toFixed(2)}`)
    console.log(`  Complementos: ${comps.length}`)
  }

  if (t === "financeiro") {
    const sheet = wb.Sheets["Relatório de Conciliação"]
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null })
    console.log(`  Linhas: ${rows.length}`)
    console.log(`  Loja: ${rows[0]["loja_id_curto"]}`)
    console.log(`  Competência: ${rows[0]["competencia"]}`)

    const pedidos = new Set()
    let bruto = 0, comissao = 0, taxaEnt = 0, taxaTrans = 0
    let promoLoja = 0, promoIfood = 0, liquido = 0
    const cancT = new Set(), cancP = new Set()
    for (const r of rows) {
      const desc = r["descricao_lancamento"]
      const fg = r["fato_gerador"]
      if (r["pedido_associado_ifood"]) pedidos.add(r["pedido_associado_ifood"])
      if (r["impacto_no_repasse"] === "SIM") liquido += (r["valor"] ?? 0)
      if (fg === "Venda") {
        if (desc === "Entrada Financeira") bruto += r["valor"] ?? 0
        else if (desc === "Comissão do iFood (entrega iFood)" || desc === "Comissão do iFood") comissao += r["valor"] ?? 0
        else if (desc === "Taxa entrega iFood") taxaEnt += r["valor"] ?? 0
        else if (desc === "Taxa de transação" || desc === "Taxa de transação iFood beneficios") taxaTrans += r["valor"] ?? 0
        else if (desc === "Promoção custeada pelo iFood") promoIfood += r["valor"] ?? 0
        else if (desc?.startsWith("Promoção custeada pela loja")) promoLoja += r["valor"] ?? 0
      }
      if (fg === "Cancelamento Total" && r["pedido_associado_ifood"]) cancT.add(r["pedido_associado_ifood"])
      if (fg === "Cancelamento Parcial" && r["pedido_associado_ifood"]) cancP.add(r["pedido_associado_ifood"])
    }
    console.log(`  Pedidos únicos: ${pedidos.size}`)
    console.log(`  Bruto (Entrada Financeira em Vendas): R$ ${bruto.toFixed(2)}`)
    console.log(`  Comissão iFood: R$ ${comissao.toFixed(2)}`)
    console.log(`  Taxa entrega: R$ ${taxaEnt.toFixed(2)}`)
    console.log(`  Taxa transação: R$ ${taxaTrans.toFixed(2)}`)
    console.log(`  Promoção LOJA: R$ ${promoLoja.toFixed(2)}`)
    console.log(`  Promoção iFood (subsídio): R$ ${promoIfood.toFixed(2)}`)
    console.log(`  Cancelamento Total: ${cancT.size} pedidos`)
    console.log(`  Cancelamento Parcial: ${cancP.size} pedidos`)
    console.log(`  LÍQUIDO (impacto SIM): R$ ${liquido.toFixed(2)}`)
  }
}
