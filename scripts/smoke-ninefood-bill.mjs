#!/usr/bin/env node
/**
 * Smoke-test da tabela ninefood_bill (migration 0046) + formato do sync.ts.
 * Grava 1 registro sintético, testa idempotência (upsert 2x = 1 linha) e apaga.
 * NÃO deixa lixo no banco. Uso: node scripts/smoke-ninefood-bill.mjs
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { createClient } from "@supabase/supabase-js"

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

const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } =
  readEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])
if (!url || !key) {
  console.error("❌ Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const ORDER_ID = "SMOKE-TEST-0046"

// 1) pega uma unidade real (FK)
const { data: units, error: uErr } = await db
  .from("units")
  .select("id")
  .limit(1)
if (uErr) {
  console.error("❌ erro lendo units:", uErr.message)
  process.exit(1)
}
if (!units?.length) {
  console.error("❌ nenhuma unidade no banco pra usar de FK")
  process.exit(1)
}
const unit = units[0]
console.log(`unidade de teste (FK): ${unit.id}`)

// 2) registro sintético no formato do sync.ts
const row = {
  unit_id: unit.id,
  app_shop_id: "cozina-teste-01",
  order_id: ORDER_ID,
  order_index: "999001",
  order_type: 1,
  delivery_type: 1,
  business_ts: 1755239136,
  business_datetime: "2025-08-15 03:25:36",
  data: "2025-08-15",
  ref_year: 2025,
  ref_month: 8,
  meal_original: 3.0,
  commission_rate: 35.0,
  commission_amount: 0.59,
  pay_commission: -0.06,
  b2p_delivery: 0,
  meal_voucher: 0,
  settlement_amount: -0.37,
  order_amount: -0.37,
  payment_channel: 212,
  expect_settle_date: "2025-08-20",
  day_payment_id: "",
  shop_id: "5764616027024920000",
  shop_name: "Cozina Teste",
  raw: { smoke: true },
}

// 3) upsert 2x → idempotência
console.log("\n→ upsert (1ª vez) …")
let up = await db
  .from("ninefood_bill")
  .upsert(row, { onConflict: "unit_id,order_id,order_type" })
if (up.error) {
  console.error("❌ upsert falhou:", up.error.message)
  process.exit(1)
}
console.log("   ok")

console.log("→ upsert (2ª vez, mesmo registro) …")
up = await db
  .from("ninefood_bill")
  .upsert({ ...row, settlement_amount: -0.4 }, {
    onConflict: "unit_id,order_id,order_type",
  })
if (up.error) {
  console.error("❌ 2º upsert falhou:", up.error.message)
  process.exit(1)
}
console.log("   ok")

// 4) confere: deve haver EXATAMENTE 1 linha, com o valor atualizado
const { data: rows, error: sErr } = await db
  .from("ninefood_bill")
  .select("id, settlement_amount, commission_rate, data, raw")
  .eq("unit_id", unit.id)
  .eq("order_id", ORDER_ID)
if (sErr) {
  console.error("❌ select falhou:", sErr.message)
  process.exit(1)
}
console.log(`\n✅ linhas encontradas: ${rows.length} (esperado: 1)`)
if (rows.length === 1) {
  console.log(
    `   settlement_amount=${rows[0].settlement_amount} (esperado -0.4 = idempotente atualizou) · commission_rate=${rows[0].commission_rate} · data=${rows[0].data}`,
  )
}

// 5) limpa
const { error: dErr } = await db
  .from("ninefood_bill")
  .delete()
  .eq("unit_id", unit.id)
  .eq("order_id", ORDER_ID)
if (dErr) {
  console.error("⚠️  não consegui apagar o registro de teste:", dErr.message)
} else {
  console.log("\n🧹 registro de teste apagado. Banco limpo.")
}

const ok = rows.length === 1 && !dErr
console.log(
  ok
    ? "\n🎉 SMOKE-TEST OK — tabela ninefood_bill aceita o formato do sync e é idempotente."
    : "\n❌ smoke-test falhou em alguma etapa.",
)
process.exit(ok ? 0 : 1)
