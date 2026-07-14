/**
 * Sobe um vídeo tutorial pro Supabase Storage (bucket "tutoriais").
 *
 * Uso:
 *   node scripts/upload-tutorial.mjs "<arquivo local.mp4>" [nome-destino.mp4]
 *
 * Ex.:
 *   node scripts/upload-tutorial.mjs ~/Movies/"Keeta - Pedidos Recentes.mp4" keeta-pedidos-recentes.mp4
 *
 * Se não passar o nome de destino, usa o nome do arquivo local.
 * Sobrescreve se já existir (upsert). Usa a SUPABASE_SERVICE_ROLE_KEY do .env.local.
 */
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { basename } from "node:path"

// Carrega o .env.local (mesmo padrão do backup-db.mjs).
for (const line of readFileSync(
  new URL("../.env.local", import.meta.url),
  "utf8",
).split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error(
    "Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local",
  )
  process.exit(1)
}

const [localPath, destArg] = process.argv.slice(2)
if (!localPath) {
  console.error(
    'Uso: node scripts/upload-tutorial.mjs "<arquivo.mp4>" [nome-destino.mp4]',
  )
  process.exit(1)
}
const dest = destArg || basename(localPath)

const bytes = readFileSync(localPath)
const supa = createClient(url, key)
const { error } = await supa.storage.from("tutoriais").upload(dest, bytes, {
  contentType: "video/mp4",
  upsert: true,
})
if (error) {
  console.error("Falhou:", error.message)
  process.exit(1)
}
console.log(
  `OK: ${basename(localPath)} -> tutoriais/${dest} (${(bytes.length / 1048576).toFixed(2)} MB)`,
)
