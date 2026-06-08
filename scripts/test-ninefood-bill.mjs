#!/usr/bin/env node
/**
 * Teste do Bill Data (extrato financeiro pedido-a-pedido) do 99 Food.
 *   POST https://openapi.99food.com/v3/finance/finance/getShopBillDetail
 *   header Authorization: Bearer <accessToken>
 *   body { acceptor_code, start_date, end_date, page_no, page_size }
 *
 * Revela se já temos a "Special Authorization" liberada (ou se precisa pedir
 * por e-mail). Uso: node scripts/test-ninefood-bill.mjs [app_shop_id] [startYYYYMMDD] [endYYYYMMDD]
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

const ymd = (d) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`

const appShopId = process.argv[2] || "cozina-teste-01"
const today = new Date()
const monthAgo = new Date(today.getTime() - 25 * 24 * 60 * 60 * 1000)
const startDate = process.argv[3] || ymd(monthAgo)
const endDate = process.argv[4] || ymd(today)

const { NINEFOOD_APP_ID: appId, NINEFOOD_APP_SECRET: appSecret } = readEnv([
  "NINEFOOD_APP_ID",
  "NINEFOOD_APP_SECRET",
])
if (!appId || !appSecret) {
  console.error("❌ Faltam NINEFOOD_APP_ID / NINEFOOD_APP_SECRET no .env.local")
  process.exit(1)
}

const FIN_BASE = "https://openapi.99food.com"

console.log(`app_shop_id: ${appShopId}`)
console.log(`período:     ${startDate} → ${endDate}\n`)

// 1) accessToken financeiro
console.log("→ POST /v3/auth/authtoken/signIn …")
const authRes = await fetch(`${FIN_BASE}/v3/auth/authtoken/signIn`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ retailer: appId, secret: appSecret }),
})
const authJson = await authRes.json().catch(() => null)
const token = authJson?.data?.accessToken ?? authJson?.accessToken
if (!token) {
  console.log("❌ Sem accessToken:", JSON.stringify(authJson).slice(0, 300))
  process.exit(1)
}
console.log(`   ✅ token ${token.slice(0, 6)}…(${token.length} chars)\n`)

// 2) Bill Data
console.log("→ POST /v3/finance/finance/getShopBillDetail …")
const res = await fetch(`${FIN_BASE}/v3/finance/finance/getShopBillDetail`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    acceptor_code: appShopId,
    page_no: 1,
    page_size: 200,
    start_date: startDate,
    end_date: endDate,
  }),
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

const brl = (c) =>
  typeof c === "number"
    ? (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—"

if (json?.errno === 0) {
  const d = json.data ?? {}
  const rows = d.data ?? []
  console.log(
    `\n✅ ACESSO LIBERADO. total_num=${d.total_num} · total_page=${d.total_page} · nesta página=${rows.length}`,
  )
  if (rows.length > 0) {
    const r = rows[0]
    console.log("\n   Exemplo (1º registro):")
    console.log(`   orderId=${r.orderId} · orderType=${r.orderType} · ${r.businessDateTime}`)
    console.log(`   bruto(meal)=${brl(r.mealOriginalAmount)} · comissão=${brl(r.commissionAmount)} (${(r.commissionRate / 100).toFixed(2)}%)`)
    console.log(`   logística=${brl(r.b2pDeliveryAmount)} · taxa pgto=${brl(r.payCommissionAmount)} · VR=${brl(r.mealVoucherAmount)}`)
    console.log(`   ⭐ settlementAmount (líquido)=${brl(r.settlementAmount)} · repasse previsto=${r.expectSettleDate}`)
    const liquido = rows.reduce((s, x) => s + (x.settlementAmount || 0), 0)
    console.log(`\n   Σ settlementAmount (${rows.length} regs): ${brl(liquido)}`)
  } else {
    console.log("   (loja de teste sem pedidos no período — esperado)")
  }
  console.log("\n🎉 Pipeline financeiro (token → extrato) FUNCIONA.")
} else {
  console.log("\n⚠️  Não retornou errno=0. Resposta crua (truncada):")
  console.log(JSON.stringify(json ?? text, null, 2).slice(0, 600))
  console.log(
    "\n→ Se for erro de permissão, é a 'Special Authorization': precisa pedir acesso à 99 por e-mail.",
  )
}

// 3) Settlements (getShopBillWeek) — permissão WhiteList
console.log("\n→ POST /v3/finance/finance/getShopBillWeek (settlements) …")
const wRes = await fetch(`${FIN_BASE}/v3/finance/finance/getShopBillWeek`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    acceptor_code: appShopId,
    page_no: 1,
    page_size: 200,
    start_date: startDate,
    end_date: endDate,
  }),
})
const wText = await wRes.text()
let wJson = null
try {
  wJson = JSON.parse(wText)
} catch {
  /* não-JSON */
}
console.log(
  `   HTTP ${wRes.status} · errno=${wJson?.errno} · errmsg=${wJson?.errmsg ?? ""}`,
)
if (wJson?.errno === 0) {
  const wd = wJson.data ?? {}
  const wrows = wd.data ?? []
  console.log(`   ✅ WhiteList OK. total_num=${wd.total_num} · nesta página=${wrows.length}`)
  if (wrows.length > 0) {
    const w = wrows[0]
    console.log(`   ex.: ${w.withdrawDate} · ${brl(w.withdrawAmount)} · ${w.settleStartDate}–${w.settleEndDate} · ${w.dayPaymentIDList?.length ?? 0} dias`)
  }
} else {
  console.log("   (sem WhiteList ou sem dados — esperado na loja de teste vazia)")
}
