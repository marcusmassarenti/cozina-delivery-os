/** Confere o resumo do Cardápio Web contra a soma crua do banco. */
import { getCardapioWebResumoForMonth } from "../src/lib/data/cardapioweb-imported"

const UNIT = "be7fd324-5932-415f-b252-c08720b7fe10"

async function main() {
  for (const [y, m] of [[2026, 3], [2026, 4], [2026, 5], [2026, 6], [2026, 7]] as const) {
    const r = await getCardapioWebResumoForMonth(UNIT, y, m)
    console.log(
      `${y}-${String(m).padStart(2, "0")}: pedidos=${r.pedidos} bruto=${r.bruto.toFixed(2)} liquido=${r.liquido.toFixed(2)} cancel=${r.cancelamentosQtd} ticket=${r.ticketMedio.toFixed(2)} semDetalhe=${r.semDetalhe}`,
    )
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
