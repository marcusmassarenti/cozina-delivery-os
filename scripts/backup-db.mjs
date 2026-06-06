/**
 * Backup lógico do banco (cinto + suspensório do backup automático do Supabase).
 * Exporta TODAS as tabelas pra arquivos JSON datados em backups/<data_hora>/.
 *
 * Uso (da raiz do projeto):
 *   node scripts/backup-db.mjs
 *
 * Depois é só copiar a pasta backups/<data_hora>/ pro Google Drive / pendrive.
 * Usa a SUPABASE_SERVICE_ROLE_KEY do .env.local (lê tudo, ignora RLS).
 */
import { createClient } from "@supabase/supabase-js"
import { readFileSync, mkdirSync, writeFileSync } from "fs"
import { execSync } from "child_process"

// ── carrega .env.local ────────────────────────────────────────────────
const env = readFileSync(".env.local", "utf8")
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local")
  process.exit(1)
}
const db = createClient(url, key)

const TABLES = [
  // Estrutura / acesso (o mais difícil de recriar)
  "holdings", "brands", "units", "unit_platforms", "user_unit_access",
  "profiles", "app_roles", "role_module_perms", "api_clients",
  // Lançamentos manuais (custos, VR, notas)
  "daily_entries", "monthly_entries", "monthly_platform_entries",
  // Cadastros de preço / produto / ficha técnica
  "unit_produto_precos", "unit_produtos_vendidos",
  "unit_embalagem", "unit_fechamentos",
  "producao_insumo", "producao_prato", "producao_prato_nome", "producao_ficha",
  // Importado das plataformas (recriável pelos relatórios, mas vai junto)
  "platform_imports",
  "ifood_financeiro_lancamentos", "ifood_avaliacoes", "ifood_pedidos",
  "ifood_cardapio_periodo", "ifood_cardapio_periodo_items",
  "ifood_cardapio_periodo_complementos", "ifood_daily_funnel",
  "ifood_daily_items", "ifood_daily_complementos",
  "ninefood_daily_loja", "ninefood_daily_item", "ninefood_pedidos",
  "keeta_daily_loja", "keeta_daily_item", "keeta_pedidos",
  "keeta_pedidos_recentes",
]

const PAGE = 1000

async function fetchAll(table) {
  // Paginado por "id" (ordem estável). Se a tabela não tem "id" (tabelas de
  // config pequenas), cai pra um fetch único.
  let rows = []
  let from = 0
  while (true) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .order("id")
      .range(from, from + PAGE - 1)
    if (error) {
      if (from === 0) {
        const { data: d2, error: e2 } = await db.from(table).select("*")
        if (e2) throw new Error(e2.message)
        if ((d2 ?? []).length === PAGE) {
          console.warn(`  ⚠ ${table}: pode ter passado de ${PAGE} linhas sem ordem estável`)
        }
        return d2 ?? []
      }
      throw new Error(error.message)
    }
    rows = rows.concat(data ?? [])
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return rows
}

const now = new Date()
const pad = (n) => String(n).padStart(2, "0")
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
  now.getDate(),
)}_${pad(now.getHours())}${pad(now.getMinutes())}`
const dir = `backups/${stamp}`
mkdirSync(dir, { recursive: true })

console.log(`Backup → ${dir}/\n`)
const manifest = {}
let total = 0
for (const t of TABLES) {
  try {
    const rows = await fetchAll(t)
    writeFileSync(`${dir}/${t}.json`, JSON.stringify(rows))
    manifest[t] = rows.length
    total += rows.length
    console.log(`  ${String(rows.length).padStart(7)}  ${t}`)
  } catch (e) {
    manifest[t] = `ERRO: ${e.message}`
    console.log(`  ERRO     ${t}: ${e.message}`)
  }
}
writeFileSync(
  `${dir}/_manifest.json`,
  JSON.stringify({ geradoEm: now.toISOString(), totalLinhas: total, tabelas: manifest }, null, 2),
)
console.log(`\n✅ Backup (JSON) completo em ${dir}/ — ${total} linhas.`)

// ── dump completo .sql (opcional) ─────────────────────────────────────
// Se SUPABASE_DB_URL estiver no .env.local e pg_dump instalado, gera o
// full-dump.sql (restaura tudo num comando). Ver docs/recuperacao-banco.md.
const dbUrl = process.env.SUPABASE_DB_URL
if (dbUrl) {
  try {
    console.log("\nGerando dump completo (pg_dump)…")
    execSync(
      `pg_dump "${dbUrl}" --no-owner --no-privileges -f "${dir}/full-dump.sql"`,
      { stdio: "inherit" },
    )
    console.log(`✅ Dump completo: ${dir}/full-dump.sql`)
  } catch (e) {
    console.warn(
      `⚠ pg_dump falhou — instale ('brew install libpq' + PATH) ou use o Supabase CLI. ${e.message}`,
    )
  }
} else {
  console.log(
    "\nℹ Pra gerar também um dump .sql restaurável com 1 comando, defina SUPABASE_DB_URL no .env.local (ver docs/recuperacao-banco.md).",
  )
}
console.log("\n👉 Copie a pasta do backup pro Google Drive.")
