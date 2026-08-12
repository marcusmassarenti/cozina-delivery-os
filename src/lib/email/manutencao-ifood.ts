import "server-only"

import { contatoDaHolding } from "@/lib/email/contato-holding"
import { enviarEmail } from "@/lib/email/enviar"
import { manutencaoIfood } from "@/lib/email/templates"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Avisa quem tem iFood sobre a manutenção programada da plataforma.
 *
 * Disparo MANUAL, não cron: é um aviso pontual de uma data específica. Se um
 * dia virar rotina, o lugar é a régua — não aqui.
 *
 * Só quem tem iFood ATIVO em alguma loja. Cliente que só usa Keeta receber um
 * aviso sobre manutenção do iFood é ruído, e ruído é o que faz as pessoas
 * pararem de ler o que a gente manda.
 *
 * A trava do `enviarEmail` (um envio bem-sucedido por tipo × cliente) impede
 * que rodar duas vezes mande dois e-mails. Como o tipo carrega a data, um
 * aviso futuro de outra manutenção não fica bloqueado por este.
 */
export async function avisarManutencaoIfood(opts?: {
  /** Holdings a pular — a do próprio dono, por exemplo. */
  excluir?: string[]
}): Promise<{
  enviados: { cliente: string; holding: string }[]
  jaEnviados: string[]
  semContato: string[]
}> {
  const out = {
    enviados: [] as { cliente: string; holding: string }[],
    jaEnviados: [] as string[],
    semContato: [] as string[],
  }
  const pular = new Set(opts?.excluir ?? [])
  const admin = createAdminClient()

  // Lojas ATIVAS com iFood ativo → marca → holding. Sem join do PostgREST
  // porque unit_platforms não tem FK pra brands; é remontado na mão, igual ao
  // contatoDaHolding.
  const { data: ups } = await admin
    .from("unit_platforms")
    .select("unit_id")
    .eq("platform", "ifood")
    .eq("active", true)
  const comIfood = new Set(
    ((ups ?? []) as { unit_id: string }[]).map((u) => u.unit_id),
  )
  if (comIfood.size === 0) return out

  const { data: us } = await admin
    .from("units")
    .select("id, active, brands!inner(holding_id, holdings(name))")
    .in("id", [...comIfood])

  const holdings = new Map<string, string>()
  for (const u of (us ?? []) as unknown as {
    id: string
    active: boolean
    brands: { holding_id: string; holdings: { name: string } | null }
  }[]) {
    if (!u.active) continue
    holdings.set(u.brands.holding_id, u.brands.holdings?.name ?? "—")
  }

  for (const [holdingId, nomeHolding] of holdings) {
    if (pular.has(holdingId)) continue
    const contato = await contatoDaHolding(holdingId)
    if (!contato?.email) {
      out.semContato.push(nomeHolding)
      continue
    }
    const m = manutencaoIfood({ nome: contato.nome })
    const r = await enviarEmail({
      holdingId,
      // A data no tipo é de propósito: a trava é por tipo × cliente, e sem ela
      // o próximo aviso de manutenção nunca sairia.
      tipo: "manutencao-ifood-2026-08-13",
      para: contato.email,
      assunto: m.assunto,
      html: m.html,
    })
    if (r.jaEnviado) out.jaEnviados.push(nomeHolding)
    else if (r.ok) out.enviados.push({ cliente: contato.email, holding: nomeHolding })
  }

  return out
}
