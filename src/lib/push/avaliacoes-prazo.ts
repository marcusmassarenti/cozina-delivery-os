/**
 * Aviso de último dia pra responder avaliação — por push.
 *
 * O painel "Esperando resposta" só ajuda quem abre a tela. O prazo do iFood é
 * de 5 dias e o custo de perder é definitivo: a avaliação publica sem a
 * resposta e o cliente nunca a vê. Um aviso no celular é o que transforma o
 * painel em rotina.
 *
 * Roda GRUDADO no sync de avaliações (7h): é ele que atualiza o status, e
 * avisar antes do sync usaria a foto de ontem — anunciando como pendente o que
 * a loja já respondeu pelo portal.
 *
 * Manda UM push por conta, com o total. Um push por avaliação viraria seis
 * notificações numa manhã e a pessoa desliga tudo.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { enviarPush } from "@/lib/push/enviar"
import { PRAZO_RESPOSTA_DIAS } from "@/lib/data/avaliacoes-pendentes"

export type ResultadoAvisoPrazo = {
  avisados: { cliente: string; avaliacoes: number; dispositivos: number }[]
  semAssinatura: string[]
}

/**
 * Data de hoje ± `delta` dias, no fuso de São Paulo, como YYYY-MM-DD.
 *
 * `en-CA` porque é o locale que formata justamente nesse formato — evita
 * montar a string à mão e errar o zero à esquerda.
 */
function diaEmSaoPaulo(delta: number): string {
  const agora = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
  )
  agora.setDate(agora.getDate() + delta)
  return agora.toLocaleDateString("en-CA")
}

/** Avisa quem tem avaliação no fim do prazo (1 dia ou menos). */
export async function avisarAvaliacoesNoPrazoFinal(): Promise<ResultadoAvisoPrazo> {
  const out: ResultadoAvisoPrazo = { avisados: [], semAssinatura: [] }
  const admin = createAdminClient()

  // Fim do prazo = a avaliação já tem 4 dias ou mais, ou seja, resta 1 dia ou
  // menos. Avisar com 4 dias de sobra seria ignorado; avisar só no 5º é tarde
  // pra quem trabalha de manhã.
  //
  // ⚠️ A data é calculada em SÃO PAULO, não com toISOString(). O `new Date()`
  // do servidor vira UTC no toISOString, e depois das 21h (BRT) isso joga o
  // corte um dia pra frente — foi assim que um teste às 21h30 anunciou 8
  // avaliações quando eram 6. O cron das 7h nunca cairia nessa, e é
  // exatamente por isso que o erro passaria despercebido.
  const corteIso = diaEmSaoPaulo(-(PRAZO_RESPOSTA_DIAS - 1))

  const { data: pendentes } = await admin
    .from("ifood_avaliacoes")
    .select("id, unit_id, nota")
    .eq("status_avaliacao", "NOT_REPLIED")
    .not("review_id", "is", null)
    .is("resposta_texto", null)
    .lte("data_avaliacao", corteIso)
  if (!pendentes || pendentes.length === 0) return out

  // De qual conta é cada avaliação. A ligação é unit → brand → holding.
  const unitIds = [...new Set(pendentes.map((p) => p.unit_id as string))]
  const { data: units } = await admin
    .from("units")
    .select("id, name, brands!inner(holding_id)")
    .in("id", unitIds)

  const holdingDaUnit = new Map<string, string>()
  for (const u of (units ?? []) as unknown as {
    id: string
    brands: { holding_id: string }
  }[]) {
    holdingDaUnit.set(u.id, u.brands.holding_id)
  }

  const porHolding = new Map<string, { total: number; lojas: Set<string> }>()
  for (const p of pendentes) {
    const h = holdingDaUnit.get(p.unit_id as string)
    if (!h) continue
    const atual = porHolding.get(h) ?? { total: 0, lojas: new Set<string>() }
    atual.total++
    atual.lojas.add(p.unit_id as string)
    porHolding.set(h, atual)
  }
  if (porHolding.size === 0) return out

  const { data: holdings } = await admin
    .from("holdings")
    .select("id, name")
    .in("id", [...porHolding.keys()])
  const nomeDaHolding = new Map(
    ((holdings ?? []) as { id: string; name: string }[]).map((h) => [
      h.id,
      h.name,
    ]),
  )

  for (const [holdingId, dados] of porHolding) {
    const nome = nomeDaHolding.get(holdingId) ?? holdingId

    const { data: assinaturas } = await admin
      .from("push_subscriptions")
      .select("user_id")
      .eq("holding_id", holdingId)
      .is("invalid_since", null)
    const userIds = [
      ...new Set(
        ((assinaturas ?? []) as { user_id: string }[]).map((a) => a.user_id),
      ),
    ]
    if (userIds.length === 0) {
      out.semAssinatura.push(nome)
      continue
    }

    const n = dados.total
    const lojas = dados.lojas.size
    const res = await enviarPush(userIds, {
      // "no fim do prazo", não "vence hoje": o corte pega quem tem 1 dia ou
      // menos, e prometer "hoje" pra quem ainda tem amanhã é a mentirinha que
      // faz a pessoa parar de confiar no aviso.
      titulo:
        n === 1
          ? "1 avaliação no fim do prazo no iFood"
          : `${n} avaliações no fim do prazo no iFood`,
      corpo:
        `Resta 1 dia ou menos pra responder${lojas > 1 ? ` · ${lojas} lojas` : ""}. ` +
        "Depois disso o iFood publica sem a sua resposta.",
      url: "/avaliacoes",
      // Mesmo tag: o aviso de hoje substitui o de ontem em vez de empilhar
      // uma pilha de "vence hoje" que ninguém lê.
      tag: "avaliacoes-prazo",
    })
    out.avisados.push({ cliente: nome, avaliacoes: n, dispositivos: res.enviados })
  }

  return out
}
