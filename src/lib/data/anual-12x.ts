import "server-only"

/**
 * Renovação do anual em 12x.
 *
 * A assinatura do Asaas renova sozinha; o parcelamento, não — ele acaba na 12ª
 * parcela. Sem esta rotina, o cliente do 12x seria cortado no fim do ano sem
 * ninguém ter cobrado nada dele.
 *
 * ── O QUE ELA FAZ ────────────────────────────────────────────────────────
 * Quinze dias antes do fim do período, emite o parcelamento dos 12 meses
 * seguintes (valores vigentes: plano, lojas, acréscimo, desconto negociado),
 * com vencimento no último dia do período, e manda o link por e-mail. É o que
 * o Termo de Adesão promete, com essas palavras.
 *
 * Pago → o webhook troca o parcelamento vigente pela renovação e empurra o fim
 * do período. Não pago → o Asaas marca vencido, o webhook agenda a suspensão
 * (7 dias de tolerância), igual à assinatura.
 *
 * ⚠️ NÃO debita o cartão sozinho. Pra isso precisaríamos guardar o token do
 * cartão (tokenização do Asaas), que não está habilitada na conta. É por isso
 * que a renovação é um link, e o termo diz exatamente isso.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { asaasCreateInstallment, asaasDeleteInstallment } from "@/lib/asaas/client"
import { getDefaultPlan, getRegraCiclos } from "@/lib/data/assinatura"
import { contarLojasCompartilhadas } from "@/lib/data/lojas-compartilhadas"
import { mensalidadeDoCliente } from "@/lib/data/mensalidade"
import { PARCELAS_12X } from "@/lib/pricing"

/** Antecedência da renovação — a mesma que o Termo de Adesão promete. */
export const DIAS_ANTES_RENOVACAO = 15

function addDays(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}
function addMonths(iso: string, meses: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + meses)
  return d.toISOString().slice(0, 10)
}
const fmtBR = (iso: string) => iso.split("-").reverse().join("/")
const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

export type ResultadoRenovacao12x = {
  emitidas: { cliente: string; fim: string; parcela: number }[]
  erros: string[]
}

export async function emitirRenovacoes12x(
  hoje: string,
): Promise<ResultadoRenovacao12x> {
  const out: ResultadoRenovacao12x = { emitidas: [], erros: [] }
  const admin = createAdminClient()

  /* Pagante, no 12x, sem renovação emitida, que não cancelou, e com o fim do
   * período dentro da janela. `paid` filtra quem está suspenso ou devendo:
   * renovar quem não pagou o ano corrente seria cobrar dois anos de uma vez. */
  const { data, error } = await admin
    .from("holdings")
    .select(
      "id, name, plan_tier, monthly_fee, price_per_unit, included_units, billing_cycle, desconto_tipo, desconto_valor, desconto_ate, asaas_customer_id, parcelado_ate, conta_interna, encerrado_em",
    )
    .eq("billing_cycle", "anual_12x")
    .eq("paid", true)
    .eq("parcelado_nao_renovar", false)
    .is("asaas_installment_renovacao_id", null)
    .not("parcelado_ate", "is", null)
    .gte("parcelado_ate", hoje)
    .lte("parcelado_ate", addDays(hoje, DIAS_ANTES_RENOVACAO))
  if (error) {
    out.erros.push(error.message)
    return out
  }

  const alvo = ((data ?? []) as Record<string, unknown>[]).filter(
    (h) => !h.conta_interna && !h.encerrado_em && h.asaas_customer_id,
  )
  if (alvo.length === 0) return out

  const [precos, regra] = await Promise.all([getDefaultPlan(), getRegraCiclos()])

  for (const h of alvo) {
    const holdingId = String(h.id)
    const nome = String(h.name)
    try {
      // Lojas ativas + compartilhadas: a mesma base do valor da assinatura.
      const { data: brands } = await admin
        .from("brands")
        .select("id")
        .eq("holding_id", holdingId)
      const brandIds = ((brands ?? []) as { id: string }[]).map((b) => b.id)
      let ativas = 0
      if (brandIds.length > 0) {
        const { count } = await admin
          .from("units")
          .select("*", { count: "exact", head: true })
          .in("brand_id", brandIds)
          .eq("active", true)
        ativas = count ?? 0
      }
      ativas += await contarLojasCompartilhadas(holdingId)

      // No ciclo 12x, a "mensalidade" é a parcela (com o desconto negociado).
      const parcela = mensalidadeDoCliente(
        h as Parameters<typeof mensalidadeDoCliente>[0],
        ativas,
        precos,
        hoje,
        regra,
      ).valor
      if (parcela <= 0) {
        out.erros.push(`${nome}: parcela zerada — renovação não emitida`)
        continue
      }

      const inicio = String(h.parcelado_ate)
      const fim = addMonths(inicio, 12)
      const inst = await asaasCreateInstallment({
        customer: String(h.asaas_customer_id),
        installmentValue: parcela,
        installmentCount: PARCELAS_12X,
        dueDate: inicio,
        description: `Delivery OS — renovação anual em 12x (${fmtBR(inicio)} a ${fmtBR(fim)})`,
        externalReference: holdingId,
      })

      // Condição no UPDATE: se duas rodadas se cruzarem, só uma renovação fica
      // — a outra é removida do Asaas na hora.
      const { data: gravou } = await admin
        .from("holdings")
        .update({ asaas_installment_renovacao_id: inst.installmentId })
        .eq("id", holdingId)
        .is("asaas_installment_renovacao_id", null)
        .select("id")
      if (!gravou || gravou.length === 0) {
        await asaasDeleteInstallment(inst.installmentId).catch(() => {})
        continue
      }

      if (inst.invoiceUrl) {
        const { contatoDaHolding } = await import("@/lib/email/contato-holding")
        const { enviarEmail } = await import("@/lib/email/enviar")
        const { renovacao12x } = await import("@/lib/email/templates")
        const contato = await contatoDaHolding(holdingId)
        if (contato) {
          const { assunto, html } = renovacao12x({
            nome: contato.nome,
            empresa: nome,
            fim: fmtBR(inicio),
            parcela: brl(parcela),
            total: brl(Math.round(parcela * PARCELAS_12X * 100) / 100),
            link: inst.invoiceUrl,
          })
          await enviarEmail({
            holdingId,
            tipo: `renovacao-12x-${inicio}`,
            para: contato.email,
            assunto,
            html,
          })
        }
      }

      out.emitidas.push({ cliente: nome, fim: inicio, parcela })
    } catch (e) {
      // Um cliente com erro no Asaas não pode impedir a renovação dos outros.
      out.erros.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return out
}
