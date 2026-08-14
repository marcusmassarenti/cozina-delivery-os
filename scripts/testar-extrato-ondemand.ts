/**
 * Prova de fogo do conserto do extrato sob demanda.
 *
 * Roda `downloadReconciliationRows` DUAS vezes seguidas na mesma loja e
 * competência e conta as chamadas com erro que cada rodada gerou. É a única
 * forma honesta de verificar isto: o que se quer provar não é que o extrato
 * baixa (isso já funcionava), é que ele baixa GASTANDO MENOS CHAMADA 4xx.
 *
 * O esperado depois do conserto:
 *   • 1ª rodada — pede o extrato (202), espera antes de perguntar → 0 erros.
 *   • 2ª rodada — reusa o requestId guardado, sem POST nenhum → 0 erros.
 * Antes, a 1ª gastava um 404 e a 2ª um 409.
 *
 *   npx tsx --tsconfig scripts/tsconfig.teste.json --env-file=.env.local \
 *     scripts/testar-extrato-ondemand.ts <merchantId> <YYYY-MM>
 */
import { createAdminClient } from "../src/lib/supabase/admin"
import { downloadReconciliationRows } from "../src/lib/ifood/reconciliation"

async function erros(desde: string): Promise<{ total: number; porStatus: string }> {
  const { data } = await createAdminClient()
    .from("ifood_api_logs")
    .select("response_status")
    .gte("created_at", desde)
    .gte("response_status", 400)
  const linhas = (data ?? []) as { response_status: number }[]
  const conta = new Map<number, number>()
  for (const l of linhas) conta.set(l.response_status, (conta.get(l.response_status) ?? 0) + 1)
  return {
    total: linhas.length,
    porStatus: [...conta.entries()].map(([s, n]) => `${s}×${n}`).join(" ") || "—",
  }
}

async function rodada(n: number, merchantId: string, competencia: string) {
  const marco = new Date().toISOString()
  const t = Date.now()
  const r = await downloadReconciliationRows(merchantId, competencia)
  // O log é gravado de forma assíncrona pelo cliente; dá um respiro.
  await new Promise((res) => setTimeout(res, 1500))
  const e = await erros(marco)
  console.log(
    `rodada ${n}: ${r.ok ? `OK (${r.rows?.length ?? 0} linhas)` : `FALHOU — ${r.linkError}`}` +
      ` | ${((Date.now() - t) / 1000).toFixed(1)}s | erros: ${e.total} (${e.porStatus})`,
  )
  return e.total
}

async function main() {
  const [merchantId, competencia] = process.argv.slice(2)
  if (!merchantId || !competencia) {
    console.error("uso: ... scripts/testar-extrato-ondemand.ts <merchantId> <YYYY-MM>")
    process.exit(1)
  }

  // Começa do zero: sem isto a 1ª rodada já acharia um pedido guardado de uma
  // execução anterior e o teste mediria outra coisa.
  await createAdminClient()
    .from("ifood_reconciliation_pedidos")
    .delete()
    .eq("merchant_id", merchantId)
    .eq("competencia", competencia)

  console.log(`Loja ${merchantId} · competência ${competencia}\n`)
  const a = await rodada(1, merchantId, competencia)
  const b = await rodada(2, merchantId, competencia)

  const { data } = await createAdminClient()
    .from("ifood_reconciliation_pedidos")
    .select("request_id, criado_em")
    .eq("merchant_id", merchantId)
    .eq("competencia", competencia)
    .maybeSingle()
  console.log(`\npedido guardado: ${JSON.stringify(data)}`)
  console.log(a + b === 0 ? "\n✅ zero chamadas com erro nas duas rodadas" : `\n⚠️ ainda houve ${a + b} erro(s)`)
}

void main()
