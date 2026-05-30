/**
 * Gera uma chave de API e insere o HASH em api_clients (a tabela precisa
 * existir — rode a migration 0019 antes). O texto puro da chave é impresso
 * UMA vez no terminal; guarde com segurança e entregue ao cliente (ex.: ERP).
 *
 * Uso (do diretório do projeto):
 *   node scripts/gen-api-key.cjs "ERP Cozina Foods" read
 *
 * Args: [nome] [escopo: read|write]  (default: "Cliente API" read)
 */
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

const env = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim()

const { createClient } = require("@supabase/supabase-js")
const sb = createClient(
  get("NEXT_PUBLIC_SUPABASE_URL"),
  get("SUPABASE_SERVICE_ROLE_KEY"),
)

const name = process.argv[2] || "Cliente API"
const scope = process.argv[3] || "read"

;(async () => {
  const raw = crypto.randomBytes(24).toString("base64url")
  const key = `cz_live_${raw}`
  const keyHash = crypto.createHash("sha256").update(key).digest("hex")
  const keyPrefix = key.slice(0, 14)

  const { error } = await sb.from("api_clients").insert({
    name,
    key_prefix: keyPrefix,
    key_hash: keyHash,
    scopes: [scope],
    active: true,
  })
  if (error) {
    console.error("ERRO ao inserir:", error.message)
    process.exit(1)
  }

  console.log("\n=== CHAVE DE API CRIADA ===")
  console.log("Cliente:", name, "| escopo:", scope)
  console.log("\nCHAVE (copie agora — só aparece UMA vez):\n")
  console.log("   " + key + "\n")
  console.log("O ERP deve mandar no header:")
  console.log("   Authorization: Bearer " + key + "\n")
  console.log(
    "No banco guardamos só o hash — não dá pra recuperar a chave depois.\n",
  )
})().catch((e) => {
  console.error("FATAL", e.message)
  process.exit(1)
})
