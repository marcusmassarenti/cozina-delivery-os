/**
 * Teste READ-ONLY da conexão iFood da Yakisushi (DG Foods).
 * Não grava nada — só autentica, confere o merchant e baixa a Conciliação
 * de jan/26 até jul/26 pra ver o que a API devolve.
 *
 * Rodar: npx tsx --env-file=.env.local scripts/teste-yakisushi.ts
 */
import { listIfoodMerchants, getIfoodMerchant } from "../src/lib/ifood/merchants"
import { downloadReconciliationRows } from "../src/lib/ifood/reconciliation"

const MERCHANT = "893e9dad-6877-40b9-9b1d-98ce1431c405"

async function main() {
  console.log("=== 1) Lista de merchants autorizados no app ===")
  const listaRes = await listIfoodMerchants()
  if (!listaRes.ok) {
    console.log(`❌ lista falhou: HTTP ${listaRes.status} ${(listaRes.error ?? listaRes.raw ?? "").slice(0, 300)}`)
  } else {
    const lista = listaRes.data ?? []
    console.log(`total autorizado(s): ${lista.length}`)
    for (const m of lista) console.log(`  - ${m.id} · ${m.name ?? "(sem nome)"}`)
    const meu = lista.find((m) => m.id === MERCHANT)
    console.log(
      meu
        ? `✅ Yakisushi ESTÁ na lista: ${meu.name ?? "(sem nome)"}`
        : `❌ Yakisushi NÃO apareceu na lista (escopo ainda não propagou?)`,
    )
  }

  console.log("\n=== 2) Detalhe do merchant ===")
  const det = await getIfoodMerchant(MERCHANT)
  if (det.ok) console.log(JSON.stringify(det.data, null, 2).slice(0, 800))
  else
    console.log(
      `❌ detalhe falhou: HTTP ${det.status} ${(det.error ?? det.raw ?? "").slice(0, 300)}`,
    )

  console.log("\n=== 3) Conciliação por competência (jan→jul/26) ===")
  for (let m = 1; m <= 7; m++) {
    const comp = `2026-${String(m).padStart(2, "0")}`
    try {
      const r = await downloadReconciliationRows(MERCHANT, comp)
      if (!r.ok) {
        console.log(
          `${comp}: ❌ status=${r.linkStatus ?? "?"} err=${r.linkError ?? "-"}`,
        )
        continue
      }
      // resumo rápido: linhas, pedidos únicos, soma com impacto, cesta válida
      let pedidos = new Set<string>()
      let somaImpacto = 0
      let cestaPorPedido = new Map<string, number>()
      const cancelados = new Set<string>()
      for (const row of r.rows) {
        const ped = String(row.pedido_associado_ifood ?? "")
        if (ped) pedidos.add(ped)
        const impacto = (row.impacto_no_repasse ?? "").toUpperCase()
        const valor = Number(String(row.valor ?? "0").replace(",", "."))
        if (impacto === "SIM" && Number.isFinite(valor)) somaImpacto += valor
        const fato = String(row.fato_gerador ?? "")
        if (fato === "Cancelamento Total" && ped) cancelados.add(ped)
        if (fato === "Venda" && ped) {
          const cesta = Number(
            String(row.valor_cesta_final ?? "").replace(",", "."),
          )
          if (Number.isFinite(cesta) && cesta > 0)
            cestaPorPedido.set(ped, Math.max(cestaPorPedido.get(ped) ?? 0, cesta))
        }
      }
      let bruto = 0
      let brutoCancel = 0
      for (const [ped, cesta] of cestaPorPedido) {
        if (cancelados.has(ped)) brutoCancel += cesta
        else bruto += cesta
      }
      console.log(
        `${comp}: ✅ ${r.rows.length} linhas · ${pedidos.size} pedidos · bruto(válido) R$ ${bruto.toFixed(2)} · cancelados ${cancelados.size} (R$ ${brutoCancel.toFixed(2)}) · líquido(impacto) R$ ${somaImpacto.toFixed(2)}`,
      )
    } catch (e) {
      console.log(`${comp}: 💥 ${e instanceof Error ? e.message : e}`)
    }
  }
}

main().catch((e) => {
  console.error("FALHA GERAL:", e)
  process.exit(1)
})
