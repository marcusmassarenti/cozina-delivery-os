/**
 * Catraca de lint: o número de erros pode CAIR, nunca subir.
 *
 * O CI tinha `npm run lint || true`, então lint verde não significava nada.
 * Tirar o `|| true` de uma vez também não resolve: hoje são 63 erros, e o CI
 * passaria a falhar em todo commit -- o que na prática vira gente ignorando o
 * vermelho, que é pior do que não ter gate.
 *
 * A catraca trava o número atual. Commit que introduz erro novo quebra; commit
 * que conserta baixa o teto sozinho (e avisa pra atualizar o arquivo). Sem
 * refatoração de risco no meio de uma correção de segurança.
 *
 * Boa parte dos 63 é `react-hooks/set-state-in-effect`, regra nova do React 19:
 * consertar é mexer em ciclo de vida de tela que está funcionando. Não é coisa
 * pra fazer junto de outra tarefa.
 *
 *   node scripts/ci/lint-catraca.mjs            # verifica
 *   node scripts/ci/lint-catraca.mjs --gravar   # regrava o teto
 */
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, existsSync } from "node:fs"

const ARQ = new URL("./lint-teto.json", import.meta.url)
const gravar = process.argv.includes("--gravar")

let saida = ""
try {
  saida = execFileSync("npx", ["eslint", "-f", "json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
} catch (e) {
  // eslint sai com código 1 quando acha erro — a saída JSON continua no stdout.
  saida = e.stdout ?? ""
  if (!saida) {
    console.error("✗ lint-catraca: eslint não produziu saída.", e.message)
    process.exit(1)
  }
}

const resultados = JSON.parse(saida)
const erros = resultados.reduce((s, r) => s + r.errorCount, 0)
const avisos = resultados.reduce((s, r) => s + r.warningCount, 0)

if (gravar) {
  writeFileSync(ARQ, JSON.stringify({ erros }, null, 2) + "\n")
  console.log(`✓ teto gravado: ${erros} erro(s)`)
  process.exit(0)
}

if (!existsSync(ARQ)) {
  console.error("✗ lint-catraca: falta lint-teto.json. Rode com --gravar.")
  process.exit(1)
}

const teto = JSON.parse(readFileSync(ARQ, "utf8")).erros

if (erros > teto) {
  console.error(
    `\n✗ Lint piorou: ${erros} erros (teto ${teto}).\n` +
      `  ${erros - teto} erro(s) novo(s). Rode \`npm run lint\` pra ver quais.\n`,
  )
  process.exit(1)
}

if (erros < teto) {
  console.log(
    `✓ Lint melhorou: ${erros} erros (teto era ${teto}). ` +
      `Baixe o teto com \`node scripts/ci/lint-catraca.mjs --gravar\`.`,
  )
  process.exit(0)
}

console.log(`✓ Lint estável: ${erros} erros, ${avisos} avisos (teto ${teto}).`)
