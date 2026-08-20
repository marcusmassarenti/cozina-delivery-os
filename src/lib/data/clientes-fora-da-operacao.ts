import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { computeBillingStatus } from "@/lib/data/billing"

/**
 * Clientes que NÃO são operação viva — num lugar só.
 *
 * ── POR QUE EXISTE (Marcus, 20/08/26) ────────────────────────────────────
 * Em três dias, três telas mostraram cliente que não deveria estar ali: a
 * Vbfood suspensa em "Conectadas" do iFood, e o joao nilson (encerrado) e a
 * Sabor & Cia (conta de demonstração) na lista do Cardápio Web. Cada tela
 * tinha — ou não tinha — a sua própria versão do filtro.
 *
 * São três motivos diferentes com a mesma consequência: a loja aparece como se
 * fosse operação real, infla a contagem de conectadas e some da conta de quem
 * de fato está pagando.
 *
 *  • suspenso — trial venceu ou cobrança parou; perdeu acesso
 *  • encerrado — relação terminada de propósito (`encerrado_em`)
 *  • conta interna — demonstração e testes nossos (`conta_interna`)
 *
 * ⚠️ ISTO É PRA TELA DE CONSULTA, não pra fila de pendência. Um cliente
 * suspenso que aparece com pendência de conexão é coisa pra resolver — some da
 * lista de "conectadas", não do trabalho.
 */
export async function clientesForaDaOperacao(): Promise<Set<string>> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("holdings")
    .select(
      "id, paid, trial_ends_at, suspend_on, due_date, encerrado_em, conta_interna",
    )
  if (error) {
    // Falhou a leitura? Não esconde ninguém. Mostrar a mais é recuperável;
    // esconder por engano faz sumir cliente pagante sem ninguém notar.
    console.error("clientesForaDaOperacao:", error.message)
    return new Set()
  }

  const fora = new Set<string>()
  for (const h of (data ?? []) as {
    id: string
    paid: boolean | null
    trial_ends_at: string | null
    suspend_on: string | null
    due_date: string | null
    encerrado_em: string | null
    conta_interna: boolean | null
  }[]) {
    if (h.conta_interna || h.encerrado_em) {
      fora.add(h.id)
      continue
    }
    const st = computeBillingStatus({
      paid: h.paid ?? false,
      trialEndsAt: h.trial_ends_at,
      suspendOn: h.suspend_on,
      dueDate: h.due_date,
      paymentMethod: null,
      monthlyFee: null,
    })
    if (st === "suspended") fora.add(h.id)
  }
  return fora
}
