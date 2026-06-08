#!/usr/bin/env node
/**
 * Gera a URL de autorização (bind) de uma loja real no 99 Food.
 *   POST https://openapi.didi-food.com/v1/auth/authorizationpage/getUrl
 *   body { app_id, app_shop_id }  → data = URL self-service
 *
 * O lojista abre a URL (logado na conta lojista do 99) e autoriza a loja,
 * que passa a ficar vinculada ao nosso app sob esse app_shop_id.
 *
 * Uso: node scripts/test-ninefood-authpage.mjs [app_shop_id]
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

const appShopId = process.argv[2] || "cnp-piloto-01"
const { NINEFOOD_APP_ID: appId } = readEnv(["NINEFOOD_APP_ID"])
if (!appId) {
  console.error("❌ Falta NINEFOOD_APP_ID no .env.local")
  process.exit(1)
}

console.log(`app_id:      ${appId}`)
console.log(`app_shop_id: ${appShopId}\n`)

const BASE = "https://openapi.didi-food.com"
console.log("→ POST /v1/auth/authorizationpage/getUrl …")
const res = await fetch(`${BASE}/v1/auth/authorizationpage/getUrl`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ app_id: appId, app_shop_id: appShopId }),
})
const text = await res.text()
let json = null
try {
  json = JSON.parse(text)
} catch {
  /* não-JSON */
}
console.log(
  `   HTTP ${res.status} · errno=${json?.errno} · errmsg=${json?.errmsg ?? ""}\n`,
)

const data = json?.data
// data pode vir como { url }, string, ou array de strings.
const urls =
  data && typeof data === "object" && data.url
    ? [data.url]
    : Array.isArray(data)
      ? data
      : typeof data === "string"
        ? [data]
        : []
if (urls.length > 0) {
  console.log("✅ URL(s) de autorização:")
  for (const u of urls) console.log(`   ${u}`)
  console.log(
    "\n→ Abra essa URL logado na conta LOJISTA do 99, escolha a loja real e autorize.",
  )
} else {
  console.log("⚠️  Sem URL na resposta. Resposta crua (truncada):")
  console.log(JSON.stringify(json ?? text, null, 2).slice(0, 600))
}
