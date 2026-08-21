/**
 * Faturas da plataforma: emissão, quitação e inadimplência.
 *
 * Separado de `holding_payments` de propósito — aquilo é o que ENTROU, isto é
 * o que foi DEVIDO. Sem as duas metades não existe inadimplência: o sistema só
 * guardava o pagamento recebido, então o que o cliente deixou de pagar não
 * deixava rastro nenhum.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  getDefaultPlan,
  precoDoPlano,
  type PlanId,
} from "@/lib/data/assinatura"

export type Fatura = {
  id: string
  holdingId: string
  competencia: string
  vencimento: string
  valor: number
  planTier: string | null
  lojasCobradas: number | null
  precoNegociado: boolean
  status: "aberta" | "paga" | "cancelada"
  pagoEm: string | null
  pagoValor: number | null
  origem: string
  nota: string | null
  /** Derivado: aberta e já passou do vencimento. */
  vencida: boolean
}

const hojeISO = () => new Date().toISOString().slice(0, 10)

function mapFatura(r: Record<string, unknown>, hoje: string): Fatura {
  const status = String(r.status) as Fatura["status"]
  const vencimento = String(r.vencimento)
  return {
    id: String(r.id),
    holdingId: String(r.holding_id),
    competencia: String(r.competencia),
    vencimento,
    valor: Number(r.valor ?? 0),
    planTier: (r.plan_tier as string | null) ?? null,
    lojasCobradas: r.lojas_cobradas != null ? Number(r.lojas_cobradas) : null,
    precoNegociado: Boolean(r.preco_negociado),
    status,
    pagoEm: (r.pago_em as string | null) ?? null,
    pagoValor: r.pago_valor != null ? Number(r.pago_valor) : null,
    origem: String(r.origem ?? "auto"),
    nota: (r.nota as string | null) ?? null,
    vencida: status === "aberta" && vencimento < hoje,
  }
}

/** Faturas de um cliente, da mais recente pra mais antiga. */
export async function getFaturasDoCliente(
  holdingId: string,
  limite = 24,
): Promise<Fatura[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("holding_invoices")
    .select("*")
    .eq("holding_id", holdingId)
    .order("competencia", { ascending: false })
    .limit(limite)
  const hoje = hojeISO()
  return ((data ?? []) as Record<string, unknown>[]).map((r) =>
    mapFatura(r, hoje),
  )
}

export type ResumoCobranca = {
  /** Faturas abertas e vencidas. */
  emAtraso: number
  valorEmAtraso: number
  /** Abertas ainda dentro do prazo. */
  aVencer: number
  valorAVencer: number
  /** Recebido no mês corrente (faturas quitadas). */
  recebidoNoMes: number
  /** Clientes distintos com pelo menos uma fatura vencida. */
  clientesInadimplentes: number
}

/** Panorama de cobrança da plataforma inteira. */
export async function getResumoCobranca(): Promise<ResumoCobranca> {
  const admin = createAdminClient()
  const hoje = hojeISO()
  const mes = hoje.slice(0, 7)

  const { data } = await admin
    .from("holding_invoices")
    .select("holding_id, valor, pago_valor, status, vencimento, pago_em")

  const out: ResumoCobranca = {
    emAtraso: 0,
    valorEmAtraso: 0,
    aVencer: 0,
    valorAVencer: 0,
    recebidoNoMes: 0,
    clientesInadimplentes: 0,
  }
  const inadimplentes = new Set<string>()

  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const status = String(r.status)
    const valor = Number(r.valor ?? 0)
    if (status === "aberta") {
      if (String(r.vencimento) < hoje) {
        out.emAtraso++
        out.valorEmAtraso += valor
        inadimplentes.add(String(r.holding_id))
      } else {
        out.aVencer++
        out.valorAVencer += valor
      }
    } else if (status === "paga" && String(r.pago_em ?? "").startsWith(mes)) {
      out.recebidoNoMes += Number(r.pago_valor ?? valor)
    }
  }
  out.clientesInadimplentes = inadimplentes.size
  return out
}

export type EmissaoResultado = {
  emitidas: { cliente: string; competencia: string; valor: number }[]
  puladas: { cliente: string; motivo: string }[]
}

/**
 * Emite a fatura da competência para todo cliente cobrável.
 *
 * Idempotente pelo índice único (holding_id, competencia) — rodar duas vezes
 * no mesmo mês não duplica cobrança, o que importa porque um cron que
 * duplicasse fatura seria pior que não ter fatura nenhuma.
 *
 * Não emite pra: quem está em teste grátis, quem não tem plano, e quem não
 * tem valor a cobrar. O cliente sem data de vencimento entra com o dia do
 * mês do próprio cadastro — melhor que não cobrar.
 */
export async function emitirFaturasDoMes(
  competencia = hojeISO().slice(0, 7),
): Promise<EmissaoResultado> {
  const admin = createAdminClient()
  const precos = await getDefaultPlan()
  const hoje = hojeISO()

  const { data: holdings } = await admin
    .from("holdings")
    .select(
      "id, name, plan_tier, monthly_fee, price_per_unit, included_units, due_date, trial_ends_at, created_at, conta_interna, desconto_primeira_fatura_pct, desconto_tipo, desconto_valor, desconto_ate, desconto_nota",
    )

  // Lojas ATIVAS por cliente — é a base do preço por loja.
  const { data: unidades } = await admin
    .from("units")
    .select("id, active, brands!inner(holding_id)")
    .eq("active", true)
  const ativasPorHolding = new Map<string, number>()
  for (const u of (unidades ?? []) as unknown as {
    brands: { holding_id: string }
  }[]) {
    const h = u.brands?.holding_id
    if (!h) continue
    ativasPorHolding.set(h, (ativasPorHolding.get(h) ?? 0) + 1)
  }

  const out: EmissaoResultado = { emitidas: [], puladas: [] }

  for (const h of (holdings ?? []) as Record<string, unknown>[]) {
    const nome = String(h.name)
    // Conta da própria casa não gera cobrança — emitir fatura pra si mesmo
    // criaria inadimplência fantasma todo mês.
    if (h.conta_interna) {
      out.puladas.push({ cliente: nome, motivo: "conta interna" })
      continue
    }
    const emTeste =
      h.trial_ends_at != null && String(h.trial_ends_at) >= hoje
    if (emTeste) {
      out.puladas.push({ cliente: nome, motivo: "em teste grátis" })
      continue
    }

    const plano = (h.plan_tier as PlanId | null) ?? null
    const negociado = h.monthly_fee != null
    const ativas = ativasPorHolding.get(String(h.id)) ?? 0

    let valor = 0
    if (negociado) {
      const inclusas = Number(h.included_units ?? 1)
      const extras = Math.max(0, ativas - inclusas)
      valor = Number(h.monthly_fee) + extras * Number(h.price_per_unit ?? 0)
    } else if (plano) {
      valor = precoDoPlano(precos, plano, ativas)
    }

    let notaFatura: string | null = null

    /**
     * OS DOIS DESCONTOS, E POR QUE NÃO SOMAM.
     *
     * São coisas diferentes e podem coexistir: o NEGOCIADO é o que foi
     * combinado com o cliente (vale todo mês), e o CUPOM de indicação vale só
     * na primeira fatura. O cliente fica com o MELHOR dos dois no mês em que
     * os dois existem — nunca com os dois somados.
     *
     * ── POR QUE (Marcus, 21/08/26) ─────────────────────────────────────────
     * Somar transformava "20% + metade no primeiro mês" em 60,4% de desconto
     * (545 → 436 → 218,40), um número que não sai de nenhuma conversa e que
     * ninguém consegue explicar pro cliente. "Metade no primeiro mês" quer
     * dizer metade do preço — R$ 272,50 —, e é isso que a fatura precisa
     * mostrar.
     *
     * `desconto_ate` no passado não desliga o desconto no banco — só para de
     * valer. Assim o histórico de "o que foi combinado" continua legível
     * depois que a promoção acaba.
     */
    const cheio = valor
    const dTipo = h.desconto_tipo as "percentual" | "valor" | null
    const dValor = Number(h.desconto_valor ?? 0)
    const dAte = h.desconto_ate as string | null
    const dVigente =
      dTipo != null && dValor > 0 && (!dAte || dAte >= hojeISO())

    const valorNegociado =
      dVigente && cheio > 0
        ? Math.max(
            0,
            dTipo === "percentual"
              ? Math.round(cheio * (100 - dValor)) / 100
              : Math.round((cheio - dValor) * 100) / 100,
          )
        : null

    // Cupom de indicação: vale uma vez só, e a marca é consumida logo abaixo —
    // se ficasse gravada, o desconto se repetiria todo mês e viraria preço,
    // não promoção.
    const descontoPct = Number(h.desconto_primeira_fatura_pct ?? 0)
    const doCupom =
      descontoPct > 0 && cheio > 0
        ? Math.round(cheio * (100 - descontoPct)) / 100
        : null

    const candidatos = [valorNegociado, doCupom].filter(
      (v): v is number => v != null,
    )
    if (candidatos.length) valor = Math.min(...candidatos)

    const rotuloNeg =
      dTipo === "percentual" ? `${dValor}%` : `R$ ${dValor.toFixed(2)}`
    if (doCupom != null && valor === doCupom) {
      notaFatura = `Cupom de indicação: ${descontoPct}% na 1ª fatura (de ${cheio.toFixed(2)} por ${valor.toFixed(2)}).`
      if (valorNegociado != null)
        notaFatura += ` A partir da próxima, vale o desconto negociado de ${rotuloNeg} (R$ ${valorNegociado.toFixed(2)}).`
    } else if (valorNegociado != null && valor === valorNegociado) {
      notaFatura = `Desconto negociado: ${rotuloNeg}${
        dAte ? ` (até ${dAte.split("-").reverse().join("/")})` : ""
      } — de ${cheio.toFixed(2)} por ${valor.toFixed(2)}.${
        h.desconto_nota ? ` ${h.desconto_nota}` : ""
      }`
      if (doCupom != null)
        notaFatura += ` (O cupom de ${descontoPct}% na 1ª fatura daria ${doCupom.toFixed(2)}; vale o maior desconto, não os dois.)`
    }

    if (valor <= 0) {
      out.puladas.push({
        cliente: nome,
        motivo: plano ? "valor zerado" : "sem plano definido",
      })
      continue
    }

    // Vencimento: o dia que o cliente já tem; senão o dia do cadastro. Cliente
    // sem data nunca era cobrado — usar o aniversário do cadastro é melhor que
    // deixar passar em branco (e ele aparece sinalizado na tela mesmo assim).
    const diaBase = h.due_date
      ? Number(String(h.due_date).slice(8, 10))
      : Number(String(h.created_at ?? hoje).slice(8, 10))
    const [ano, mes] = competencia.split("-").map(Number)
    const ultimoDia = new Date(ano, mes, 0).getDate()
    const vencimento = `${competencia}-${String(Math.min(diaBase || 1, ultimoDia)).padStart(2, "0")}`

    const { error } = await admin.from("holding_invoices").insert({
      holding_id: h.id,
      competencia,
      vencimento,
      valor,
      plan_tier: plano,
      lojas_cobradas: ativas,
      preco_negociado: negociado,
      origem: "auto",
      nota: notaFatura,
    })
    if (error) {
      // 23505 = índice único: a fatura do mês já existe. Não é erro.
      out.puladas.push({
        cliente: nome,
        motivo: error.code === "23505" ? "já emitida" : error.message,
      })
      continue
    }
    // Consome o cupom só DEPOIS de a fatura existir de verdade. Zerar antes
    // deixaria o cliente sem desconto se o insert falhasse.
    if (descontoPct > 0) {
      await admin
        .from("holdings")
        .update({ desconto_primeira_fatura_pct: null })
        .eq("id", h.id)
    }

    out.emitidas.push({ cliente: nome, competencia, valor })
  }

  return out
}

/**
 * Quita a fatura aberta mais antiga do cliente com um pagamento registrado.
 *
 * Amarra o recebimento à dívida: sem isso o pagamento entrava no caixa e a
 * fatura seguia aberta, inflando a inadimplência com dinheiro que já entrou.
 */
export async function quitarFaturaComPagamento(
  holdingId: string,
  paymentId: string,
  pagoEm: string,
  valor: number,
): Promise<{ ok: boolean; competencia?: string }> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("holding_invoices")
    .select("id, competencia")
    .eq("holding_id", holdingId)
    .eq("status", "aberta")
    .order("competencia", { ascending: true })
    .limit(1)

  const alvo = (data ?? [])[0] as { id: string; competencia: string } | undefined
  if (!alvo) return { ok: false }

  const { error } = await admin
    .from("holding_invoices")
    .update({
      status: "paga",
      pago_em: pagoEm,
      pago_valor: valor,
      payment_id: paymentId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", alvo.id)

  return { ok: !error, competencia: alvo.competencia }
}
