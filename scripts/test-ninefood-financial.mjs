#!/usr/bin/env node
/**
 * Teste de autenticação da Financial API do 99 Food.
 * POST https://openapi.99food.com/v3/auth/authtoken/signIn { retailer, secret }
 * → { accessToken, expiresIn }
 *
 * NÃO imprime o secret nem o accessToken completos (só tamanho/prefixo).
 * Uso: node scripts/test-ninefood-financial.mjs
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, "..", ".env.local")

function readEnv(keys) {
  const out = {}
  let raw
  try {
    raw = readFileSync(envPath, "utf8")
  } catch {
    return out
  }
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m || !keys.includes(m[1])) continue
    let v = m[2].trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    out[m[1]] = v
  }
  return out
}

const { NINEFOOD_APP_ID: appId, NINEFOOD_APP_SECRET: appSecret } = readEnv([
  "NINEFOOD_APP_ID",
  "NINEFOOD_APP_SECRET",
])
if (!appId || !appSecret) {
  console.error("❌ Faltam NINEFOOD_APP_ID / NINEFOOD_APP_SECRET no .env.local")
  process.exit(1)
}

console.log(`retailer (app_id): ${appId}`)
console.log(`secret:            ${appSecret.length} caracteres (oculto)\n`)

const FIN_BASE = "https://openapi.99food.com"
const mask = (t) => (t ? `${t.slice(0, 6)}…(${t.length} chars)` : "(vazio)")

console.log("→ POST /v3/auth/authtoken/signIn …")
const res = await fetch(`${FIN_BASE}/v3/auth/authtoken/signIn`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ retailer: appId, secret: appSecret }),
})
const text = await res.text()
let json = null
try {
  json = JSON.parse(text)
} catch {
  /* não-JSON */
}

console.log(
  `   HTTP ${res.status} · errno=${json?.errno} · errmsg=${json?.errmsg ?? ""}`,
)
const token = json?.data?.accessToken ?? json?.accessToken
const expiresIn = json?.data?.expiresIn ?? json?.expiresIn

console.log("")
if (token) {
  console.log(`✅ accessToken (financeiro) obtido: ${mask(token)}`)
  console.log(`   expiresIn: ${expiresIn}`)
  console.log("\n🎉 Auth da Financial API FUNCIONA.")
} else {
  console.log("❌ Não veio accessToken. Resposta crua (truncada):")
  console.log(JSON.stringify(json ?? text, null, 2).slice(0, 600))
}
