import "server-only"

import { getRealMonthlyForUnits } from "@/lib/data/lancamentos"
import { getCancelamentoCestaForMonth } from "@/lib/data/ifood-imported"
import { fmtBRL, fmtNum } from "@/lib/format"

/**
 * O ano da loja, do jeito que o PAINEL conta.
 *
 * Existe porque o resumo antigo (em conexao-ativada.ts) fazia a própria
 * conta somando `ifood_financeiro_lancamentos` direto. Três erros nasceram daí,
 * e o Marcus pegou os três olhando o número:
 *
 *  1. somava só `impacto_no_repasse` → era REPASSE, não faturamento, e ia com
 *     o rótulo "Faturamento". Na Jardins: R$ 442 mil em vez de R$ 844 mil;
 *  2. mesmo somando a conta certa (Entrada Financeira de Venda), dava R$ 789
 *     mil — porque o bruto do painel inclui a CESTA dos cancelados, regra que
 *     o Marcus definiu e que vive noutro lugar;
 *  3. era só iFood, e a loja vende em três plataformas — em julho, o iFood era
 *     49% do faturamento dela.
 *
 * A lição é a regra desta função: número que vai pro cliente sai da MESMA
 * fonte que a tela. Se a régua do bruto mudar amanhã, muda nos dois juntos.
 */

export type LinhaResumo = { rotulo: string; valor: string }

export type PlataformaResumo = { nome: string; valor: string; pct: number }

export async function resumoDoAno(
  unitId: string,
  hoje = new Date(),
): Promise<{
  linhas: LinhaResumo[]
  plataformas: PlataformaResumo[]
  temDado: boolean
}> {
  const ano = hoje.getFullYear()
  const ateMes = hoje.getMonth() + 1

  let bruto = 0
  let pedidos = 0
  let cancelados = 0
  let primeiroMes: number | null = null
  // Quanto veio de CADA plataforma. Sem isto o e-mail mostra "R$ 1,5 milhão"
  // e o cliente lê como se fosse iFood — o compartilhamento entrega as três,
  // e é justamente isso que ele precisa entender.
  const porPlataforma = new Map<string, number>()

  for (let m = 1; m <= ateMes; m++) {
    const [monthly, cesta] = await Promise.all([
      getRealMonthlyForUnits([unitId], ano, m),
      // A cesta é o que separa "valor das vendas" (o número do portal) do
      // faturamento já descontado dos cancelados. O hero da unidade soma ela;
      // o e-mail tem que somar também, senão os dois divergem.
      getCancelamentoCestaForMonth(unitId, ano, m).catch(() => ({
        qtd: 0,
        valor: 0,
      })),
    ])
    const u = monthly.get(unitId)
    if (!u) continue
    const brutoMes = (u.faturamentoBruto ?? 0) + (cesta?.valor ?? 0)
    if (brutoMes <= 0 && (u.pedidos ?? 0) === 0) continue
    if (primeiroMes == null) primeiroMes = m
    bruto += brutoMes
    pedidos += u.pedidos ?? 0
    cancelados += u.pedidosCancelados ?? 0
    for (const p of u.platforms ?? []) {
      if (!p.bruto) continue
      // A cesta é do iFood; some nele pra o split fechar com o total.
      const extra = p.id === "ifood" ? (cesta?.valor ?? 0) : 0
      porPlataforma.set(p.name, (porPlataforma.get(p.name) ?? 0) + p.bruto + extra)
    }
  }

  if (bruto <= 0 && pedidos === 0)
    return { linhas: [], plataformas: [], temDado: false }

  const MES = [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez",
  ]
  const linhas: LinhaResumo[] = [
    { rotulo: "Faturamento no ano", valor: fmtBRL(bruto) },
    {
      rotulo: "Período",
      valor:
        primeiroMes != null && primeiroMes !== ateMes
          ? `${MES[primeiroMes - 1]} a ${MES[ateMes - 1]}/${String(ano).slice(2)}`
          : `${MES[ateMes - 1]}/${String(ano).slice(2)}`,
    },
    { rotulo: "Pedidos", valor: fmtNum(pedidos) },
  ]
  if (pedidos > 0)
    linhas.push({ rotulo: "Ticket médio", valor: fmtBRL(bruto / pedidos) })
  if (cancelados > 0)
    linhas.push({ rotulo: "Cancelados", valor: fmtNum(cancelados) })

  const plataformas = [...porPlataforma.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([nome, valor]) => ({
      nome,
      valor: fmtBRL(valor),
      pct: bruto > 0 ? Math.round((valor / bruto) * 100) : 0,
    }))

  return { linhas, plataformas, temDado: true }
}

/**
 * O ano da loja NUMA plataforma só — pro e-mail de "conectado", que fala de
 * uma integração específica ("o iFood está conectado e já trouxe isto").
 *
 * Mesma disciplina do `resumoDoAno`: o número sai da fonte que a tela usa.
 * Para o iFood isso significa o resumo financeiro + a cesta dos cancelados —
 * a regra do bruto que o Marcus definiu e que não vive numa query solta.
 */
export async function resumoDoAnoIfood(
  unitId: string,
  hoje = new Date(),
): Promise<{ linhas: LinhaResumo[]; temDado: boolean }> {
  const { getFinanceiroResumoByUnits } = await import(
    "@/lib/data/ifood-imported"
  )
  const ano = hoje.getFullYear()
  const ateMes = hoje.getMonth() + 1

  let bruto = 0
  let pedidos = 0
  let primeiroMes: number | null = null

  for (let m = 1; m <= ateMes; m++) {
    const [resumo, cesta] = await Promise.all([
      getFinanceiroResumoByUnits([unitId], ano, m),
      getCancelamentoCestaForMonth(unitId, ano, m).catch(() => ({
        qtd: 0,
        valor: 0,
      })),
    ])
    const r = resumo.get(unitId)
    if (!r) continue
    const brutoMes = (r.bruto ?? 0) + (cesta?.valor ?? 0)
    if (brutoMes <= 0 && (r.pedidosUnicos ?? 0) === 0) continue
    if (primeiroMes == null) primeiroMes = m
    bruto += brutoMes
    pedidos += r.pedidosUnicos ?? 0
  }

  if (bruto <= 0 && pedidos === 0) return { linhas: [], temDado: false }

  const MES = [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez",
  ]
  const linhas: LinhaResumo[] = [
    { rotulo: "Faturamento no ano", valor: fmtBRL(bruto) },
    {
      rotulo: "Período",
      valor:
        primeiroMes != null && primeiroMes !== ateMes
          ? `${MES[primeiroMes - 1]} a ${MES[ateMes - 1]}/${String(ano).slice(2)}`
          : `${MES[ateMes - 1]}/${String(ano).slice(2)}`,
    },
    { rotulo: "Pedidos", valor: fmtNum(pedidos) },
  ]
  if (pedidos > 0)
    linhas.push({ rotulo: "Ticket médio", valor: fmtBRL(bruto / pedidos) })
  return { linhas, temDado: true }
}
