/**
 * Manda um push avulso pro dispositivo de um usuário do Delivery OS.
 *
 *   npx tsx --tsconfig scripts/tsconfig.teste.json --env-file=.env.local \
 *     scripts/push-avulso.ts <email> "<titulo>" "<corpo>" [url]
 *
 * Usa o mesmo enviarPush do resumo semanal — se as chaves VAPID não
 * estiverem no ambiente, ele avisa e não manda nada (no-op registrado).
 */
import { createAdminClient } from "../src/lib/supabase/admin"
import { enviarPush } from "../src/lib/push/enviar"

const [email, titulo, corpo, url] = process.argv.slice(2)

async function main() {
  if (!email || !titulo || !corpo) {
    console.error('uso: push-avulso.ts <email> "<titulo>" "<corpo>" [url]')
    process.exit(1)
  }
  const admin = createAdminClient()
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const u = (data?.users ?? []).find((x) => x.email === email)
  if (!u) throw new Error(`Usuário ${email} não encontrado.`)

  const r = await enviarPush([u.id], { titulo, corpo, url: url ?? "/inicio", tag: "avulso" })
  console.log(JSON.stringify({ para: email, ...r }, null, 2))
  if (r.semChave) console.log("\n⚠️  VAPID ausente no ambiente — nada foi enviado.")
  else if (r.enviados === 0) console.log("\n⚠️  Nenhum dispositivo válido recebeu.")
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
