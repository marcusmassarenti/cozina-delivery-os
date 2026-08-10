/**
 * Confere o parser do relatório Super contra um arquivo de verdade.
 *
 * Existe porque a aba "Próxima Avaliação" passou despercebida desde que o
 * parser foi escrito: ele lia só "Nível Atual" e ninguém notou que metade do
 * relatório ficava de fora. Um teste que abre o arquivo e conta as duas abas
 * pega esse tipo de omissão — revisar código não pega.
 *
 * Não toca banco. Roda em memória:
 *
 *   npx tsx --tsconfig scripts/tsconfig.teste.json \
 *     scripts/teste-parse-super.ts <caminho-do-xlsx>
 */
import * as XLSX from "xlsx"

import { parseIfoodSuper } from "../src/lib/import/ifood/parse-super"

const arquivo = process.argv[2]
if (!arquivo) {
  console.error("uso: teste-parse-super.ts <caminho-do-xlsx>")
  process.exit(1)
}

const wb = XLSX.readFile(arquivo)
const r = parseIfoodSuper(wb)

const atual = r.porLoja.filter((l) => l.tipo === "atual")
const proxima = r.porLoja.filter((l) => l.tipo === "proxima")

console.log(`abas no arquivo: ${wb.SheetNames.join(" · ")}`)
console.log(`lidas: ${atual.length} de "Nível Atual", ${proxima.length} de "Próxima Avaliação"\n`)

if (proxima.length === 0) {
  console.error('⚠️  Nenhuma linha de "Próxima Avaliação" — a aba existe?')
}

// Os 5 critérios do programa, conforme o blog de parceiros do iFood.
const METAS = {
  pedidos: 180,
  avaliacoes: 40,
  nota: 4.7,
  cancelamento: 1,
  chamados: 2.5,
}

for (const grupo of [
  { nome: "NÍVEL ATUAL (selo vigente)", linhas: atual },
  { nome: "PRÓXIMA AVALIAÇÃO (parcial)", linhas: proxima },
]) {
  if (!grupo.linhas.length) continue
  console.log(`── ${grupo.nome} ──`)
  for (const l of grupo.linhas.slice(0, 4)) {
    const falhas: string[] = []
    if (l.pedidosConcluidos < METAS.pedidos)
      falhas.push(`pedidos ${l.pedidosConcluidos}/${METAS.pedidos}`)
    if (l.pedidosAvaliados < METAS.avaliacoes)
      falhas.push(`avaliações ${l.pedidosAvaliados}/${METAS.avaliacoes}`)
    if ((l.mediaAvaliacoes ?? 0) < METAS.nota)
      falhas.push(`nota ${l.mediaAvaliacoes}`)
    if ((l.pctCancelamento ?? 0) > METAS.cancelamento)
      falhas.push(`cancel ${l.pctCancelamento}%`)
    if ((l.pctChamados ?? 0) > METAS.chamados)
      falhas.push(`chamados ${l.pctChamados}%`)

    console.log(
      `  ${l.storeName?.slice(0, 34).padEnd(34)} ${String(l.status).padEnd(9)}` +
        ` super=${l.eSuper ? "sim" : "não"} · ${l.periodLabel}`,
    )
    console.log(
      `    pedidos ${l.pedidosConcluidos} · aval ${l.pedidosAvaliados} · nota ${l.mediaAvaliacoes}` +
        ` · cancel ${l.pctCancelamento}% · chamados ${l.pctChamados}%`,
    )
    // O ponto do exercício: quem está DENTRO do selo mas perto do limite. É
    // esse aviso que dá tempo de reagir antes do recálculo do dia 10.
    if (falhas.length) console.log(`    ✗ fora do critério: ${falhas.join(" · ")}`)
    else console.log(`    ✓ dentro dos 5 critérios`)
  }
  console.log()
}
