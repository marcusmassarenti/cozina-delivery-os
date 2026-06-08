#!/usr/bin/env node
/**
 * Teste de autenticação 99 Food (DiDi Food Open Platform).
 * Valida: app_id + app_secret + app_shop_id → auth_token.
 *
 * NÃO imprime o app_secret nem o auth_token completos (só tamanho/prefixo).
 * Uso: node scripts/test-ninefood-auth.mjs <app_shop_id>
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, "..", ".env.local")

/** Lê só as chaves pedidas do .env.local (não expõe o resto do arquivo). */
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

const appShopId = process.argv[2]
if (!appShopId) {
  console.error("Uso: node scripts/test-ninefood-auth.mjs <app_shop_id>")
  process.exit(1)
}

const { NINEFOOD_APP_ID: appId, NINEFOOD_APP_SECRET: appSecret } = readEnv([
  "NINEFOOD_APP_ID",
  "NINEFOOD_APP_SECRET",
])
if (!appId || !appSecret) {
  console.error("❌ Faltam NINEFOOD_APP_ID / NINEFOOD_APP_SECRET no .env.local")
  process.exit(1)
}

console.log(`app_id:      ${appId}`)
console.log(`app_secret:  ${appSecret.length} caracteres (oculto)`)
console.log(`app_shop_id: ${appShopId}\n`)

const BASE = "https://openapi.didi-food.com"
function buildUrl(path) {
  const u = new URL(`${BASE}/v1/auth/authtoken/${path}`)
  u.searchParams.set("app_id", appId)
  u.searchParams.set("app_secret", appSecret)
  u.searchParams.set("app_shop_id", appShopId)
  return u
}
async function call(path) {
  const res = await fetch(buildUrl(path), { method: "GET" })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* resposta não-JSON */
  }
  return { status: res.status, json, text }
}
const mask = (t) => (t ? `${t.slice(0, 4)}…(${t.length} chars)` : "(vazio)")

console.log("→ GET /v1/auth/authtoken/get …")
let r = await call("get")
console.log(
  `   HTTP ${r.status} · errno=${r.json?.errno} · errmsg=${r.json?.errmsg ?? ""}`,
)
let token = r.json?.data?.auth_token

if (!token) {
  console.log("   sem auth_token → tentando refresh primeiro…")
  const rr = await call("refresh")
  console.log(
    `   refresh: HTTP ${rr.status} · errno=${rr.json?.errno} · errmsg=${rr.json?.errmsg ?? ""}`,
  )
  r = await call("get")
  console.log(
    `   get(2): HTTP ${r.status} · errno=${r.json?.errno} · errmsg=${r.json?.errmsg ?? ""}`,
  )
  token = r.json?.data?.auth_token
}

console.log("")
if (token) {
  const exp = r.json?.data?.token_expiration_time
  console.log(`✅ auth_token obtido: ${mask(token)}`)
  if (exp) {
    console.log(
      `   expira em: ${new Date(exp * 1000).toISOString()} (epoch ${exp})`,
    )
  }
  console.log("\n🎉 Pipeline credencial → auth_token FUNCIONA.")

  // Bônus: prova que o token é USÁVEL numa chamada de dados real.
  console.log("\n→ GET /v1/shop/shop/detail (usando o auth_token) …")
  const du = new URL(`${BASE}/v1/shop/shop/detail`)
  du.searchParams.set("auth_token", token)
  const d = await fetch(du, { method: "GET" })
  const dt = await d.text()
  let dj = null
  try {
    dj = JSON.parse(dt)
  } catch {
    /* não-JSON */
  }
  console.log(
    `   HTTP ${d.status} · errno=${dj?.errno} · errmsg=${dj?.errmsg ?? ""}`,
  )
  if (dj?.data) {
    const s = dj.data
    console.log(
      `   ✅ loja: shop_id=${s.shop_id} · nome=${s.name ?? s.shop_name ?? "?"} · app_shop_id=${s.app_shop_id ?? "?"} · biz_status=${s.biz_status}`,
    )
  } else {
    console.log(`   resposta: ${JSON.stringify(dj ?? dt).slice(0, 300)}`)
  }
} else {
  console.log("❌ Não veio auth_token. Resposta crua (truncada):")
  console.log(JSON.stringify(r.json ?? r.text, null, 2).slice(0, 600))
}
