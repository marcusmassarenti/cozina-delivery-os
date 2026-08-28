import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"

/**
 * O P&L da AGÊNCIA — T8.
 *
 * ⚠️ NÃO É O FINANCEIRO DO LOJISTA QUE JÁ EXISTE.
 *
 * O módulo Financeiro responde "quanto sobrou pra LOJA depois das taxas da
 * plataforma". Este responde "quanto sobrou pra AGÊNCIA depois das despesas
 * dela". Reaproveitar as tabelas de lá misturaria a mensalidade cobrada com a
 * receita que a loja fez — dois dinheiros que nunca se somam.
 *
 * ── PROJETADO E REALIZADO SÃO COISAS SEPARADAS ──────────────────────────
 * O projetado sai da `mensalidade` do cadastro; o realizado sai das cobranças
 * lançadas. Derivar um do outro é a armadilha do repasse do iFood outra vez:
 * o número reconstruído bate quase sempre e mente exatamente nos meses que
 * importam — o que teve desconto, o que entrou atrasado, o que ninguém pagou.
 */

export type Cobranca = {
  id: string
  loja: string | null
  competencia: string
  valor: number
  vencimento: string
  pagoEm: string | null
  observacao: string | null
  situacao: "pago" | "aberto" | "atrasado"
}

export type Despesa = {
  id: string
  categoria: string
  descricao: string
  valor: number
  vencimento: string
  pagoEm: string | null
}

export type FinanceiroAgencia = {
  /** Soma das mensalidades das lojas ATIVAS — o que se espera por mês. */
  projetadoMensal: number
  projetadoSemanal: number
  lojasComMensalidade: number
  lojasSemMensalidade: number
  recebido: number
  aberto: number
  atrasado: number
  despesasPagas: number
  despesasAbertas: number
  sobra: number
  cobrancas: Cobranca[]
  despesas: Despesa[]
  porCategoria: { categoria: string; valor: number }[]
}

const hojeISO = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })

export async function financeiroDaAgencia(periodo: {
  start: string
  end: string
}): Promise<FinanceiroAgencia> {
  const vazio: FinanceiroAgencia = {
    projetadoMensal: 0,
    projetadoSemanal: 0,
    lojasComMensalidade: 0,
    lojasSemMensalidade: 0,
    recebido: 0,
    aberto: 0,
    atrasado: 0,
    despesasPagas: 0,
    despesasAbertas: 0,
    sobra: 0,
    cobrancas: [],
    despesas: [],
    porCategoria: [],
  }
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return vazio
  const admin = createAdminClient()

  const [{ data: lojasRaw }, { data: cobRaw }, { data: despRaw }] =
    await Promise.all([
      admin
        .from("units")
        .select("id, active, mensalidade, brands!inner(holding_id)")
        .eq("brands.holding_id", holdingId),
      admin
        .from("agencia_cobrancas")
        .select("id, competencia, valor, vencimento, pago_em, observacao, units(name)")
        .eq("holding_id", holdingId)
        .gte("vencimento", periodo.start)
        .lte("vencimento", periodo.end)
        .order("vencimento"),
      admin
        .from("agencia_despesas")
        .select("id, categoria, descricao, valor, vencimento, pago_em")
        .eq("holding_id", holdingId)
        .gte("vencimento", periodo.start)
        .lte("vencimento", periodo.end)
        .order("vencimento"),
    ])

  const ativas = ((lojasRaw ?? []) as unknown as {
    active: boolean
    mensalidade: number | string | null
  }[]).filter((l) => l.active)
  const comValor = ativas.filter((l) => l.mensalidade !== null)
  const projetadoMensal = comValor.reduce(
    (s, l) => s + Number(l.mensalidade),
    0,
  )

  const hoje = hojeISO()
  const cobrancas: Cobranca[] = ((cobRaw ?? []) as unknown as {
    id: string
    competencia: string
    valor: number | string
    vencimento: string
    pago_em: string | null
    observacao: string | null
    units: { name: string } | null
  }[]).map((c) => ({
    id: c.id,
    loja: c.units?.name ?? null,
    competencia: c.competencia,
    valor: Number(c.valor),
    vencimento: c.vencimento,
    pagoEm: c.pago_em,
    observacao: c.observacao,
    /* PAGO GANHA DE VENCIDO, sempre — a mesma ordem do `computeBillingStatus`
       da cobrança do SaaS. Conta pago depois do vencimento é conta paga, e
       marcá-la de vermelha faria a tela cobrar dinheiro que já entrou. */
    situacao: c.pago_em ? "pago" : c.vencimento < hoje ? "atrasado" : "aberto",
  }))

  const despesas: Despesa[] = ((despRaw ?? []) as unknown as {
    id: string
    categoria: string
    descricao: string
    valor: number | string
    vencimento: string
    pago_em: string | null
  }[]).map((d) => ({
    id: d.id,
    categoria: d.categoria,
    descricao: d.descricao,
    valor: Number(d.valor),
    vencimento: d.vencimento,
    pagoEm: d.pago_em,
  }))

  const soma = (xs: { valor: number }[]) => xs.reduce((s, x) => s + x.valor, 0)
  const recebido = soma(cobrancas.filter((c) => c.situacao === "pago"))
  const despesasPagas = soma(despesas.filter((d) => d.pagoEm !== null))

  const porCategoria = new Map<string, number>()
  for (const d of despesas) {
    porCategoria.set(d.categoria, (porCategoria.get(d.categoria) ?? 0) + d.valor)
  }

  return {
    projetadoMensal,
    /* Semana = mês ÷ 4,33 (52/12). Dividir por 4 daria 13 semanas a mais no
       ano — quase um mês inteiro de receita inventada. */
    projetadoSemanal: projetadoMensal / 4.33,
    lojasComMensalidade: comValor.length,
    lojasSemMensalidade: ativas.length - comValor.length,
    recebido,
    aberto: soma(cobrancas.filter((c) => c.situacao === "aberto")),
    atrasado: soma(cobrancas.filter((c) => c.situacao === "atrasado")),
    despesasPagas,
    despesasAbertas: soma(despesas.filter((d) => d.pagoEm === null)),
    /* Sobra = o que ENTROU menos o que SAIU. Só dinheiro que se moveu — usar
       o previsto aqui daria uma sobra que existe na planilha e não na conta. */
    sobra: recebido - despesasPagas,
    cobrancas,
    despesas,
    porCategoria: [...porCategoria]
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor),
  }
}
