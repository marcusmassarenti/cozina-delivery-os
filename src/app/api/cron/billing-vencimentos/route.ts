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
import { registrarCron } from "@/lib/cron/registrar"
import { getDefaultPlan } from "@/lib/data/assinatura"
import { mensalidadeDoCliente } from "@/lib/data/mensalidade"
import { contatoDaHolding } from "@/lib/email/contato-holding"
import { enviarEmail } from "@/lib/email/enviar"
import { contaSuspensa, clienteSuspensoInterno } from "@/lib/email/templates"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/** Dias de tolerância entre vencer e perder acesso — igual ao webhook Asaas. */
const TOLERANCIA_DIAS = 7

/** 2026-08-21 → 21/08/2026. */
function fmtBR(iso: string): string {
  return iso.split("-").reverse().join("/")
}

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

  // Envelope de registro: deixa rastro em cron_runs pra o relatório
  // diário saber a diferença entre "rodou e não achou nada" e "não rodou".
  return registrarCron("billing-vencimentos", async () => {

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

  /* ── O DIA DA SUSPENSÃO ──────────────────────────────────────────────────
   * O bloqueio sempre foi silencioso: `computeBillingStatus` compara a data a
   * cada request e manda pra /suspenso. Do lado do cliente, a tela muda
   * embaixo do pé dele sem nenhuma explicação — e a primeira reação de quem é
   * cortado sem aviso é achar que o sistema quebrou, não que a fatura venceu.
   *
   * Sai no dia em que a suspensão de fato acontece. Os avisos de "vai vencer"
   * e "está em atraso" já existem e são outra conversa: este explica um fato
   * consumado e mostra a saída.
   *
   * A data entra no tipo do e-mail porque a trava de duplicidade é
   * (holding, tipo): com tipo fixo, um cliente que voltasse e caísse de novo
   * meses depois seria cortado em silêncio. */
  const suspensos: { nome: string; valor: number }[] = []
  const { data: caiuHoje } = await admin
    .from("holdings")
    .select(
      "id, name, due_date, suspend_on, conta_interna, encerrado_em, plan_tier, monthly_fee, price_per_unit, included_units, billing_cycle, desconto_tipo, desconto_valor, desconto_ate",
    )
    .eq("paid", false)
    .not("suspend_on", "is", null)
    .lte("suspend_on", hoje)

  const aSuspender = ((caiuHoje ?? []) as Record<string, unknown>[]).filter(
    (h) => !h.conta_interna && !h.encerrado_em,
  )

  if (aSuspender.length > 0) {
    const precos = await getDefaultPlan()
    for (const h of aSuspender) {
      const holdingId = String(h.id)
      const nome = String(h.name)
      try {
        // Lojas ativas: entram na conta do valor e no aviso interno.
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

        const { valor } = mensalidadeDoCliente(
          h as Parameters<typeof mensalidadeDoCliente>[0],
          ativas,
          precos,
          hoje,
        )
        const venc = h.due_date ? fmtBR(String(h.due_date)) : null
        const dia = String(h.suspend_on)

        const contato = await contatoDaHolding(holdingId)
        if (contato) {
          const { assunto, html } = contaSuspensa({
            nome: contato.nome,
            empresa: nome,
            temLoja: ativas > 0,
            valorMensal: valor > 0 ? valor : undefined,
            vencimento: venc,
          })
          await enviarEmail({
            holdingId,
            tipo: `conta-suspensa-${dia}`,
            para: contato.email,
            assunto,
            html,
          })
        }

        const interno = clienteSuspensoInterno({
          empresa: nome,
          valorMensal: valor > 0 ? valor : null,
          vencimento: venc,
          lojas: ativas,
        })
        await enviarEmail({
          holdingId,
          tipo: `cliente-suspenso-interno-${dia}`,
          para: process.env.SAUDE_EMAIL ?? "marcus@massarenti.me",
          assunto: interno.assunto,
          html: interno.html,
        })

        suspensos.push({ nome, valor })
      } catch (e) {
        // Um cliente sem contato não pode impedir o aviso dos outros.
        console.error(`[billing-vencimentos] aviso de suspensão ${nome}:`, e)
      }
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
    suspensos,
    semVencimento: ((semVenc ?? []) as { name: string }[]).map((h) => h.name),
  })
  })
}
