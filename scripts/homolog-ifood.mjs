// Homologação iFood — diagnóstico das 3 erradas.
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"

const envRaw = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
const env = (k) => {
  const m = envRaw.match(new RegExp("^\\s*" + k + "=(.*)$", "m"))
  return m ? m[1].trim() : null
}
const clientId = env("IFOOD_TEST_CLIENT_ID")
const clientSecret = env("IFOOD_TEST_CLIENT_SECRET")
const M = "500f2b4d-1807-4a9c-9e7d-93e87c128891"
const BASE = "https://merchant-api.ifood.com.br"
const homo = { "x-request-homologation": "true" }
const tr = await fetch(`${BASE}/authentication/v1.0/oauth/token`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grantType: "client_credentials", clientId, clientSecret }),
})
const token = (await tr.json()).accessToken
const auth = { Authorization: `Bearer ${token}`, ...homo }
const rec = await fetch(`${BASE}/financial/v3.0/merchants/${M}/reconciliation?competence=2025-08`, { headers: auth })
const url = (await rec.json()).downloadPath
const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
let csv
try { csv = gunzipSync(buf).toString("utf8") } catch { csv = buf.toString("utf8") }
const lines = csv.split(/\r?\n/).filter((l) => l.length > 0)
const header = lines[0].split(";")
const idx = Object.fromEntries(header.map((h, i) => [h, i]))
const num = (v) => { const n = parseFloat((v || "").replace(",", ".")); return isNaN(n) ? 0 : n }
const all = lines.slice(1).map((l) => l.split(";"))

// ===== Recon Q5 — net dos lançamentos de Cancelamento =====
const cancFatos = new Set(["Cancelamento Total", "Cancelamento Parcial"])
let cancFatoNet = 0, cancFatoN = 0
for (const r of all) if (cancFatos.has(r[idx.fato_gerador])) { cancFatoNet += num(r[idx.valor]); cancFatoN++ }
console.log("Recon Q5 — net só lançamentos de Cancelamento:", cancFatoNet.toFixed(2), `(${cancFatoN} linhas)`)

// ===== FE5 — entradas LOJA no período (várias formas) =====
const per = all.filter((r) => r[idx.data_apuracao_inicio] === "2025-08-01" && r[idx.data_apuracao_fim] === "2025-08-03")
console.log("\nFE5 — período 01-03/08 (", per.length, "linhas):")
let a1 = 0, a2 = 0, a3 = 0
for (const r of per) {
  const v = num(r[idx.valor])
  if (r[idx.tipo_lancamento] === "Entrada Financeira" && r[idx.responsavel_transacao] === "LOJA") a1 += v
  if (r[idx.responsavel_transacao] === "LOJA") a2 += v
  if (r[idx.tipo_lancamento] === "Entrada Financeira") a3 += v
}
console.log("  Entrada Financeira + LOJA:", a1.toFixed(2), "(foi 98.60, ERRADO)")
console.log("  TODOS resp.=LOJA (qualquer tipo):", a2.toFixed(2))
console.log("  TODAS Entradas Financeiras (qualquer resp.):", a3.toFixed(2))
console.log("  linhas resp.=LOJA no período:")
for (const r of per.filter((r) => r[idx.responsavel_transacao] === "LOJA"))
  console.log(`    ${r[idx.tipo_lancamento]} | ${r[idx.descricao_lancamento]} | ${r[idx.valor]}`)

// ===== Settlements Q4 — saldos exatos =====
const sj = await (await fetch(`${BASE}/financial/v3.0/merchants/${M}/settlements`, { headers: auth })).json()
const items = sj.settlements?.[0]?.closingItems || []
console.log("\nSettlements Q4 — closingItems (type/amount):")
for (const it of items) console.log(`  ${it.type}: ${it.amount}`)
const repasse = items.find((i) => i.type === "REPASSE")
console.log("  originDetails do REPASSE:")
for (const o of repasse?.originDetails || []) console.log(`    ${o.type}: ${o.amount}`)
