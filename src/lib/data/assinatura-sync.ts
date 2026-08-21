/**
 * Mantém o valor da assinatura recorrente do Asaas alinhado com o número de
 * lojas do cliente.
 *
 * Por que existe: a mensalidade é "primeira loja + adicionais", então cada
 * loja nova muda o preço. A assinatura no Asaas, porém, foi criada com o valor
 * do dia da adesão e ficava congelada — cliente que dobrava de tamanho seguia
 * pagando o valor de quando tinha uma loja só. Isso não dá erro em lugar
 * nenhum: a cobrança continua acontecendo, no valor errado, todo mês.
 *
 * O caminho inverso também vale: quem fecha loja passa a pagar menos. Cobrar a
 * mais de quem encolheu é pior que deixar de cobrar de quem cresceu.
 */
import "server-only"

import { asaasUpdateSubscription } from "@/lib/asaas/client"
import { aplicarDescontos } from "@/lib/data/descontos"
import { valorMensalExibido, type BillingCycle } from "@/lib/pricing"
import { createAdminClient } from "@/lib/supabase/admin"
import { contarLojasCompartilhadas } from "@/lib/data/lojas-compartilhadas"
import {
  getDefaultPlan,
  precoDoPlano,
  PLANOS_META,
  type PlanId,
} from "@/lib/data/assinatura"

export type SyncAssinaturaResultado = {
  ok: boolean
  /** Não fez nada e por quê (sem assinatura, conta interna, valor igual...). */
  motivo?: string
  de?: number
  para?: number
}

/**
 * Recalcula e envia o valor da assinatura de UM cliente.
 *
 * Silencioso de propósito: é chamado de dentro de ações de cadastro de loja, e
 * uma falha no Asaas não pode impedir o usuário de salvar a unidade dele. O
 * cron diário de faturas passa depois e corrige o que não foi.
 */
export async function sincronizarValorAssinatura(
  holdingId: string,
): Promise<SyncAssinaturaResultado> {
  try {
    const admin = createAdminClient()
    const { data: h } = await admin
      .from("holdings")
      .select(
        "id, name, plan_tier, monthly_fee, price_per_unit, included_units, asaas_subscription_id, conta_interna, asaas_sub_valor, billing_cycle, desconto_tipo, desconto_valor, desconto_ate",
      )
      .eq("id", holdingId)
      .maybeSingle()

    if (!h) return { ok: false, motivo: "cliente não encontrado" }
    if (h.conta_interna) return { ok: false, motivo: "conta interna" }
    if (!h.asaas_subscription_id)
      return { ok: false, motivo: "sem assinatura recorrente" }

    // Lojas ATIVAS — é o que define o preço.
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

    // Lojas de OUTRA empresa que este cliente acompanha. Contam igual: uma
    // loja compartilhada consome as mesmas telas, relatórios e IA que uma
    // própria, e o preço do plano é por loja — não por titularidade.
    //
    // ⚠️ Se um dia a política mudar ("acompanhar é de graça"), o lugar de
    // mudar é aqui, e não removendo a marcação de compartilhada — ela também
    // é o que trava a escrita na loja emprestada.
    const compartilhadas = await contarLojasCompartilhadas(holdingId)
    ativas += compartilhadas

    const plano = (h.plan_tier as PlanId | null) ?? null
    let valor: number
    if (h.monthly_fee != null) {
      const inclusas = Number(h.included_units ?? 1)
      const extras = Math.max(0, ativas - inclusas)
      valor = Number(h.monthly_fee) + extras * Number(h.price_per_unit ?? 0)
    } else if (plano) {
      const precos = await getDefaultPlan()
      // Ciclo mensal custa +30% sobre a base (que é a do plano anual).
      valor = valorMensalExibido(
        precoDoPlano(precos, plano, ativas),
        (h.billing_cycle as BillingCycle | null) ?? "anual",
      )
    } else {
      return { ok: false, motivo: "sem plano definido" }
    }

    /* Desconto negociado: a MESMA regra da fatura e do checkout, no módulo
     * @/lib/data/descontos.
     *
     * ── POR QUE (Marcus, 21/08/26) ─────────────────────────────────────────
     * Esta rotina roda a cada loja cadastrada e no cron diário, e mandava pro
     * Asaas o preço de tabela puro. Ou seja: ela DESFAZIA o desconto e o ciclo
     * toda vez que rodasse — inclusive por cima de um valor corrigido à mão no
     * painel do Asaas, sem deixar rastro. Cupom fica de fora de propósito: ele
     * vale só na 1ª fatura, e isto aqui é o valor que se repete pra sempre. */
    valor = aplicarDescontos(
      valor,
      {
        tipo: (h.desconto_tipo ?? null) as "percentual" | "valor" | null,
        valor: Number(h.desconto_valor ?? 0),
        ate: (h.desconto_ate ?? null) as string | null,
      },
      0,
      new Date().toISOString().slice(0, 10),
    ).valor

    if (valor <= 0) return { ok: false, motivo: "valor zerado" }

    // Não bate na API à toa: só quando o valor realmente mudou.
    const atual = h.asaas_sub_valor != null ? Number(h.asaas_sub_valor) : null
    if (atual != null && Math.abs(atual - valor) < 0.01) {
      return { ok: true, motivo: "valor já está correto", de: atual, para: valor }
    }

    const rotulo = plano ? (PLANOS_META[plano]?.label ?? plano) : "Plano"
    await asaasUpdateSubscription(String(h.asaas_subscription_id), {
      value: valor,
      description: `DeliveryOS ${rotulo} · ${ativas} loja${ativas !== 1 ? "s" : ""}`,
      // Reflete nas cobranças futuras JÁ geradas. Sem isso a próxima fatura
      // sairia no valor velho e a correção só valeria dali a dois meses.
      updatePendingPayments: true,
    })

    await admin
      .from("holdings")
      .update({ asaas_sub_valor: valor })
      .eq("id", holdingId)

    return { ok: true, de: atual ?? undefined, para: valor }
  } catch (e) {
    // Nunca derruba quem chamou: cadastrar loja não pode falhar por causa do
    // Asaas. O cron de faturas reconcilia depois.
    console.error("sincronizarValorAssinatura:", e)
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
  }
}

/** Reconciliação de todos os clientes com assinatura — rede de segurança. */
export async function sincronizarTodasAssinaturas(): Promise<
  { cliente: string; de?: number; para?: number; motivo?: string }[]
> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("holdings")
    .select("id, name")
    .not("asaas_subscription_id", "is", null)
    .eq("conta_interna", false)

  const out: { cliente: string; de?: number; para?: number; motivo?: string }[] =
    []
  for (const h of (data ?? []) as { id: string; name: string }[]) {
    const r = await sincronizarValorAssinatura(h.id)
    // Só reporta o que MUDOU — listar "já está correto" de todo mundo todo dia
    // faz o log virar ruído e esconder a mudança de verdade.
    if (r.ok && r.para != null && r.de !== r.para) {
      out.push({ cliente: h.name, de: r.de, para: r.para })
    } else if (!r.ok && r.motivo && r.motivo !== "sem assinatura recorrente") {
      out.push({ cliente: h.name, motivo: r.motivo })
    }
  }
  return out
}
