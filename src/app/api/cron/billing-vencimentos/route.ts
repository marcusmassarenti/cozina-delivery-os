/**
 * Cron diário de vencimento: fecha o ciclo de cobrança de quem paga FORA do
 * Asaas (Pix, boleto na mão, transferência).
 *
 * Por que existe: o bloqueio em si já era automático — `computeBillingStatus`
 * compara com a data a cada request e o layout manda pra /suspenso. O que NÃO
 * era automático é o `paid` voltar pra false. Ele é marcado à mão, então um
 * cliente marcado como pago em maio continuava "em dia" em dezembro, com o
 * vencimento vencido há meses e nenhum efeito.
 *
 * No Asaas isso já funcionava: o webhook recebe PAYMENT_OVERDUE e rebaixa o
 * paid agendando a suspensão. Aqui a gente faz o mesmo pra quem não tem
 * assinatura recorrente — mesma tolerância de 7 dias, pro comportamento não
 * depender da forma de pagamento.
 *
 * NÃO suspende na hora: passa pra "atrasado", que ainda tem acesso, e agenda a
 * suspensão. Cortar o cliente no dia seguinte ao vencimento por um Pix que
 * pode ter caído no fim de semana é pior que esperar uma semana.
 */
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/** Dias de tolerância entre vencer e perder acesso — igual ao webhook Asaas. */
const TOLERANCIA_DIAS = 7

function addDays(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const admin = createAdminClient()
  const hoje = new Date().toISOString().slice(0, 10)

  const { data, error } = await admin
    .from("holdings")
    .select("id, name, paid, due_date, suspend_on, asaas_subscription_id")
    .eq("paid", true)
    .not("due_date", "is", null)
    .lt("due_date", hoje)

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }

  const candidatos = ((data ?? []) as {
    id: string
    name: string
    due_date: string
    suspend_on: string | null
    asaas_subscription_id: string | null
  }[]).filter((h) => !h.asaas_subscription_id) // Asaas é do webhook

  const rebaixados: { nome: string; venceu: string; suspendeEm: string }[] = []
  for (const h of candidatos) {
    const suspendeEm = h.suspend_on ?? addDays(h.due_date, TOLERANCIA_DIAS)
    const { error: e } = await admin
      .from("holdings")
      .update({ paid: false, suspend_on: suspendeEm })
      .eq("id", h.id)
      .eq("paid", true) // corrida: se alguém marcou pago agora, não desfaz
    if (!e) {
      rebaixados.push({
        nome: h.name,
        venceu: h.due_date,
        suspendeEm,
      })
    }
  }

  // Diagnóstico: pagante SEM vencimento nunca entra na régua acima — o sistema
  // jamais vai cobrar. Não dá pra corrigir sozinho (qual data seria?), mas
  // aparecer no retorno do cron é melhor do que descobrir no fim do ano.
  const { data: semVenc } = await admin
    .from("holdings")
    .select("name")
    .eq("paid", true)
    .is("due_date", null)

  return Response.json({
    ok: true,
    ranAt: new Date().toISOString(),
    rebaixados,
    semVencimento: ((semVenc ?? []) as { name: string }[]).map((h) => h.name),
  })
}
