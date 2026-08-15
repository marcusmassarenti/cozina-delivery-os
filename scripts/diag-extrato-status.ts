/**
 * Pergunta ao iFood o STATUS REAL dos extratos que estão na fila.
 *
 * Rodar:
 *   npx tsx --tsconfig scripts/tsconfig.teste.json --env-file=.env.local \
 *     scripts/diag-extrato-status.ts
 *
 * Existe porque o coletor classifica "tempo esgotado" como "ainda gerando", e
 * isso ESCONDE a pergunta que importa quando nada é coletado: o iFood está
 * gerando devagar, ou o pedido morreu e a gente está polindo um id fantasma?
 * Aqui a resposta crua aparece, sem interpretação no meio.
 */
import { createAdminClient } from "../src/lib/supabase/admin"
import { getReconciliationRequest } from "../src/lib/ifood/reconciliation"

async function main() {
  const admin = createAdminClient()
  const { data } = await admin
    .from("ifood_reconciliation_pedidos")
    .select("merchant_id, competencia, request_id, criado_em")
    .eq("competencia", "2026-08")
    .order("criado_em")
    .limit(8)

  const linhas = (data ?? []) as {
    merchant_id: string
    competencia: string
    request_id: string
    criado_em: string
  }[]

  console.log(`Conferindo ${linhas.length} pedidos de 2026-08\n`)

  for (const p of linhas) {
    const idade = Math.round(
      (Date.now() - Date.parse(p.criado_em)) / 60_000,
    )
    const st = await getReconciliationRequest(p.merchant_id, p.request_id)
    console.log(
      `${p.merchant_id.slice(0, 8)} · pedido há ${idade} min · HTTP ${st.status} · ` +
        `status="${st.data?.status ?? "—"}"`,
    )
    if (!st.ok) console.log(`   raw: ${(st.raw ?? "").slice(0, 200)}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
