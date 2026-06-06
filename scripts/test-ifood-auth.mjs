/**
 * Testa a autenticação no iFood (client_credentials) usando as credenciais do
 * .env.local. NÃO imprime o token nem o secret — só confirma se conectou.
 *
 * Uso: node scripts/test-ifood-auth.mjs
 */
import { readFileSync } from "fs"

const env = readFileSync(".env.local", "utf8")
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}

const clientId = process.env.IFOOD_CLIENT_ID
const clientSecret = process.env.IFOOD_CLIENT_SECRET
if (!clientId || !clientSecret) {
  console.error("❌ Preencha IFOOD_CLIENT_ID e IFOOD_CLIENT_SECRET no .env.local")
  process.exit(1)
}

const body = new URLSearchParams({
  grantType: "client_credentials",
  clientId,
  clientSecret,
})

const res = await fetch(
  "https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // ambiente de teste / homologação (sandbox) — não precisa estar homologado
      "x-request-homologation": "true",
    },
    body,
  },
)

const text = await res.text()
if (!res.ok) {
  console.error(`❌ iFood recusou (HTTP ${res.status}):`)
  console.error(text.slice(0, 500))
  process.exit(1)
}

let json
try {
  json = JSON.parse(text)
} catch {
  console.error("❌ Resposta não-JSON:", text.slice(0, 300))
  process.exit(1)
}

if (json.accessToken) {
  console.log("✅ Autenticou no iFood!")
  console.log(`   tipo: ${json.type ?? "?"}`)
  console.log(`   token: ${String(json.accessToken).length} caracteres (não vou mostrar)`)
  console.log(`   expira em: ${json.expiresIn ?? "?"} segundos (~${Math.round((json.expiresIn ?? 0) / 3600)}h)`)
} else {
  console.error("❌ Resposta sem accessToken:", JSON.stringify(json).slice(0, 300))
  process.exit(1)
}
