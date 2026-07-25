/** Exercita o caminho OAuth ponta a ponta: token guardado -> chamada real. */
import { fetchCw } from "../src/lib/cardapioweb/client"
import { createAdminClient } from "../src/lib/supabase/admin"

async function main() {
  const admin = createAdminClient()
  const { data: i } = await admin
    .from("cardapioweb_installs")
    .select("id, ambiente, auth_mode, merchant_id, token_expires_at")
    .eq("merchant_id", "11974")
    .single()

  console.log(`install ${i!.merchant_id} · ${i!.auth_mode} · token expira ${i!.token_expires_at}`)

  for (const [rotulo, path] of [
    ["loja (store)", "/api/partner/v1/store"],
    ["catálogo (catalog)", "/api/partner/v1/catalog"],
  ] as const) {
    const r = await fetchCw<unknown>({
      installId: i!.id,
      ambiente: i!.ambiente,
      authMode: i!.auth_mode,
      path,
      tier: "lento",
      endpointLabel: `GET ${path} (diag oauth)`,
    })
    console.log(`  ${rotulo}: ${r.ok ? "OK " + r.status : `FALHOU ${r.status} — ${r.error}`}`)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
