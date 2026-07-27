/**
 * Big numbers da base inteira: faturamento de TODAS as unidades, das 4
 * plataformas, com API e sem, de todos os clientes.
 *
 * Rodar:
 *   npx tsx --tsconfig scripts/tsconfig.teste.json --env-file=.env.local \
 *     scripts/diag-big-numbers.ts
 *
 * Usa `getRealMonthlyForUnits`, o MESMO agregador do Dashboard e do DRE, pra
 * o número não divergir do que aparece na tela. A régua do bruto aqui é a do
 * portal: total COM cancelados (a cesta real).
 */
import { getRealMonthlyForUnits } from "../src/lib/data/lancamentos"
import { createAdminClient } from "../src/lib/supabase/admin"

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const num = (v: number) => v.toLocaleString("pt-BR")

async function main() {
  const admin = createAdminClient()

  const { data: unitsRaw } = await admin
    .from("units")
    .select("id, code, name, active, brand_id")
  const { data: brands } = await admin.from("brands").select("id, holding_id")
  const { data: holdings } = await admin.from("holdings").select("id, name")

  const brandHolding = new Map(
    ((brands ?? []) as { id: string; holding_id: string }[]).map((b) => [
      b.id,
      b.holding_id,
    ]),
  )
  const holdingNome = new Map(
    ((holdings ?? []) as { id: string; name: string }[]).map((h) => [
      h.id,
      h.name,
    ]),
  )
  const units = ((unitsRaw ?? []) as {
    id: string
    code: string
    name: string
    active: boolean
    brand_id: string | null
  }[]).map((u) => ({
    ...u,
    holding:
      holdingNome.get(brandHolding.get(u.brand_id ?? "") ?? "") ?? "(sem cliente)",
  }))
  const unitIds = units.map((u) => u.id)
  const porUnidade = new Map(units.map((u) => [u.id, u]))

  console.log(`unidades na base: ${units.length} (${units.filter((u) => u.active).length} ativas)`)

  // Varre 2026 inteiro mês a mês — o agregador é por competência.
  const meses: { y: number; m: number }[] = []
  for (let m = 1; m <= 12; m++) meses.push({ y: 2026, m })

  type Acc = {
    bruto: number
    liquido: number
    pedidos: number
    cancelados: number
  }
  const zero = (): Acc => ({ bruto: 0, liquido: 0, pedidos: 0, cancelados: 0 })
  const total = zero()
  const porPlataforma = new Map<string, Acc>()
  const porCliente = new Map<string, Acc>()
  const porMes = new Map<string, Acc>()
  const porLoja = new Map<string, Acc>()

  for (const { y, m } of meses) {
    const mapa = await getRealMonthlyForUnits(unitIds, y, m)
    const chaveMes = `${y}-${String(m).padStart(2, "0")}`
    for (const [unitId, um] of mapa) {
      const u = porUnidade.get(unitId)
      if (!u) continue
      // Pedidos e cancelados são da UNIDADE (não vêm no breakdown por
      // plataforma), então entram uma vez só — nos totais de loja, cliente e
      // mês. O corte por plataforma leva só o dinheiro.
      const ped = um.pedidos ?? 0
      const canc = um.pedidosCancelados ?? 0
      let brutoUnidade = 0
      let liqUnidade = 0

      for (const p of um.platforms ?? []) {
        const bruto = p.bruto ?? 0
        const liq = p.liquido ?? 0
        if (bruto === 0 && liq === 0) continue
        brutoUnidade += bruto
        liqUnidade += liq
        const acc = porPlataforma.get(p.id) ?? zero()
        acc.bruto += bruto
        acc.liquido += liq
        porPlataforma.set(p.id, acc)
      }

      if (brutoUnidade === 0 && ped === 0) continue
      for (const [chave, mapaAlvo] of [
        [u.holding, porCliente],
        [chaveMes, porMes],
        [`${u.code} · ${u.name}`, porLoja],
      ] as const) {
        const acc = (mapaAlvo as Map<string, Acc>).get(chave) ?? zero()
        acc.bruto += brutoUnidade
        acc.liquido += liqUnidade
        acc.pedidos += ped
        acc.cancelados += canc
        ;(mapaAlvo as Map<string, Acc>).set(chave, acc)
      }
      total.bruto += brutoUnidade
      total.liquido += liqUnidade
      total.pedidos += ped
      total.cancelados += canc
    }
  }

  const linha = (rot: string, a: Acc) =>
    `${rot.padEnd(34)} ${brl(a.bruto).padStart(18)} ${brl(a.liquido).padStart(18)} ${num(a.pedidos).padStart(9)} ${num(a.cancelados).padStart(8)}`
  const cab = `${"".padEnd(34)} ${"BRUTO".padStart(18)} ${"LÍQUIDO".padStart(18)} ${"PEDIDOS".padStart(9)} ${"CANCEL".padStart(8)}`

  console.log("\n════ TOTAL GERAL (2026) ════")
  console.log(cab)
  console.log(linha("TODAS AS LOJAS", total))
  if (total.pedidos > 0) {
    console.log(`ticket médio: ${brl(total.bruto / total.pedidos)}`)
    console.log(
      `% líquido sobre bruto: ${((total.liquido / total.bruto) * 100).toFixed(1)}%`,
    )
    console.log(
      `taxa de cancelamento: ${((total.cancelados / total.pedidos) * 100).toFixed(2)}%`,
    )
  }

  const dump = (titulo: string, mapa: Map<string, Acc>, limite?: number) => {
    console.log(`\n════ ${titulo} ════`)
    console.log(cab)
    const arr = [...mapa.entries()].sort((a, b) => b[1].bruto - a[1].bruto)
    for (const [k, a] of limite ? arr.slice(0, limite) : arr)
      console.log(linha(k, a))
  }

  dump("POR PLATAFORMA", porPlataforma)
  dump("POR CLIENTE", porCliente)
  dump("TOP 15 LOJAS", porLoja, 15)

  console.log("\n════ POR MÊS ════")
  console.log(cab)
  for (const [k, a] of [...porMes.entries()].sort())
    if (a.bruto > 0) console.log(linha(k, a))

  console.log(`\nlojas com faturamento: ${porLoja.size}`)
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
