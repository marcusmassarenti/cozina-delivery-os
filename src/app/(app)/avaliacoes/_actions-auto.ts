"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { getVisibleUnits } from "@/lib/data/units"
import {
  getCurrentHoldingId,
  getUnidadesSomenteLeitura,
  getVerComoHoldingId,
  userCan,
} from "@/lib/auth/permissions"
import { getIaStatus } from "@/lib/data/diagnostico-ia"
import { textoOuNull } from "@/lib/format"

/**
 * Ações da resposta automática e do popup das notas baixas.
 * O motor mora em `lib/avaliacoes/resposta-automatica.ts`.
 *
 * As três travas da resposta manual valem aqui também, pelo mesmo motivo —
 * isto publica texto ASSINADO PELA LOJA no iFood:
 *  1. permissão de escrita em avaliações;
 *  2. a loja está entre as que o usuário enxerga;
 *  3. loja emprestada por outra empresa fica de fora.
 */

export type AutoState = { ok: boolean; message?: string }

/** Lojas que o usuário pode ligar/desligar: visíveis, dele, com API do iFood. */
async function lojasPermitidas(ids: string[]): Promise<string[]> {
  const [units, emprestadas] = await Promise.all([
    getVisibleUnits(),
    getUnidadesSomenteLeitura(),
  ])
  const visiveis = new Set(units.map((u) => u.id))
  const pedidas = ids.filter((id) => visiveis.has(id) && !emprestadas.has(id))
  if (pedidas.length === 0) return []
  const { data } = await createAdminClient()
    .from("unit_platforms")
    .select("unit_id")
    .eq("platform", "ifood")
    .not("api_store_id", "is", null)
    .in("unit_id", pedidas)
  return [...new Set((data ?? []).map((r) => r.unit_id as string))]
}

export async function definirRespostaAutomatica(
  unitIds: string[],
  ativa: boolean,
): Promise<AutoState> {
  const [pode, verComo] = await Promise.all([
    userCan("avaliacoes", "edit"),
    getVerComoHoldingId(),
  ])
  if (!pode) return { ok: false, message: "Seu perfil não pode responder avaliações." }
  if (verComo !== null)
    return { ok: false, message: "No modo “ver como o cliente” nada é alterado." }

  const ids = await lojasPermitidas(unitIds)
  if (ids.length === 0)
    return { ok: false, message: "Nenhuma dessas lojas pode ser alterada por você." }

  const {
    data: { user },
  } = await (await createClient()).auth.getUser()
  const { error } = await createAdminClient()
    .from("units")
    .update(
      ativa
        ? {
            resposta_auto_avaliacoes: true,
            resposta_auto_ativada_por: user?.id ?? null,
            resposta_auto_ativada_em: new Date().toISOString(),
          }
        : { resposta_auto_avaliacoes: false },
    )
    .in("id", ids)
  if (error) return { ok: false, message: error.message }

  /* O adicional é cobrado por loja ligada: a mensalidade muda AGORA, não no
     cron de amanhã. Silencioso se falhar (sem assinatura, conta interna...) —
     o cron diário de assinaturas reconcilia.

     Em `after()` (Marcus, 25/09/26: "demora demais pra habilitar"): o clique
     esperava a ida e volta ao Asaas E a tela de Avaliações inteira ser refeita
     (3–4 s, duas vezes). O botão já mostra o novo estado na hora; a cobrança
     é acertada logo depois da resposta, sem prender ninguém. Sem
     `revalidatePath` pelo mesmo motivo: o cartão guarda o estado sozinho. */
  const holdingId = await getCurrentHoldingId()
  if (holdingId) {
    after(async () => {
      try {
        const { sincronizarValorAssinatura } = await import("@/lib/data/assinatura-sync")
        await sincronizarValorAssinatura(holdingId)
      } catch (e) {
        console.error("[resposta-auto] sync da assinatura:", e)
      }
    })
  }
  return { ok: true }
}

/**
 * Quais estrelas a automática responde — escolha do CLIENTE (vale pra todas
 * as lojas ligadas dele). Pelo menos uma; só 1 a 5.
 */
export async function definirNotasRespostaAuto(
  notas: number[],
): Promise<AutoState & { notas?: number[] }> {
  const [pode, verComo] = await Promise.all([
    userCan("avaliacoes", "edit"),
    getVerComoHoldingId(),
  ])
  if (!pode) return { ok: false, message: "Seu perfil não pode responder avaliações." }
  if (verComo !== null)
    return { ok: false, message: "No modo “ver como o cliente” nada é alterado." }
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, message: "Conta não identificada." }
  const validas = [...new Set(notas.map(Number))].filter((n) => n >= 1 && n <= 5).sort()
  if (validas.length === 0)
    return { ok: false, message: "Escolha pelo menos uma nota." }
  // Devolve o que FICOU no banco: a tela mostra isso, não o que ela pediu —
  // no teste de 25/09 dois cliques seguidos deixaram tela e banco diferentes.
  const { data, error } = await createAdminClient()
    .from("holdings")
    .update({ resposta_auto_notas: validas })
    .eq("id", holdingId)
    .select("resposta_auto_notas")
    .single()
  if (error) return { ok: false, message: error.message }
  // Sem revalidatePath: refazer a tela inteira custava 3–4 s por estrela, e o
  // cartão já mostra o que o banco devolveu.
  return { ok: true, notas: (data?.resposta_auto_notas as number[] | null) ?? validas }
}

/**
 * Roda a automática AGORA nas lojas ligadas que o usuário enxerga — sem
 * esperar a rotina das 7h. Clique explícito: ligar a opção não publica nada
 * sozinho no mesmo instante (um toque errado não vira 50 respostas).
 */
export async function responderPendentesAgora(): Promise<
  AutoState & { respondidas?: number; puladas?: number; paradoPorTempo?: boolean }
> {
  if (!(await userCan("avaliacoes", "edit")))
    return { ok: false, message: "Seu perfil não pode responder avaliações." }
  if ((await getVerComoHoldingId()) !== null)
    return { ok: false, message: "No modo “ver como o cliente” nada é alterado." }

  const visiveis = (await getVisibleUnits()).map((u) => u.id)
  const ids = await lojasPermitidas(visiveis)
  if (ids.length === 0) return { ok: true, respondidas: 0, puladas: 0 }

  const { responderAvaliacoesAutomaticamente } = await import(
    "@/lib/avaliacoes/resposta-automatica"
  )
  const r = await responderAvaliacoesAutomaticamente({
    limiteMs: 45_000,
    unitIds: ids,
  })
  revalidatePath("/avaliacoes")
  return {
    ok: true,
    respondidas: r.respondidas,
    puladas: r.puladas,
    paradoPorTempo: r.paradoPorTempo,
  }
}

export type AvaliacaoRuim = {
  avaliacaoId: string
  unitId: string
  loja: string
  code: string
  nota: number
  comentario: string | null
  tagsNegativas: string[]
  dataAvaliacao: string
  diasRestantes: number
}

/**
 * As notas 1–3 que ainda dá pra responder — o conteúdo do popup.
 *
 * Só pra quem pode responder e fora do "ver como": o popup existe pra pedir
 * uma ação, e mostrar a quem não pode agir é só barulho.
 */
export async function avaliacoesRuinsParaPopup(): Promise<{
  itens: AvaliacaoRuim[]
  podeIa: boolean
}> {
  const vazio = { itens: [], podeIa: false }
  if ((await getVerComoHoldingId()) !== null) return vazio
  if (!(await userCan("avaliacoes", "edit"))) return vazio

  const units = await getVisibleUnits()
  const emprestadas = await getUnidadesSomenteLeitura()
  const minhas = units.filter((u) => !emprestadas.has(u.id))
  if (minhas.length === 0) return vazio
  const porId = new Map(minhas.map((u) => [u.id, u]))

  const prazo = 5
  const limite = new Date()
  limite.setDate(limite.getDate() - prazo)
  const { data } = await createAdminClient()
    .from("ifood_avaliacoes")
    .select("id, unit_id, nota, comentario, tags_negativas, data_avaliacao, resposta_auto_pulada")
    .in(
      "unit_id",
      minhas.map((u) => u.id),
    )
    .eq("status_avaliacao", "NOT_REPLIED")
    .is("resposta_texto", null)
    .not("review_id", "is", null)
    .lte("nota", 3)
    .gte("data_avaliacao", limite.toISOString().slice(0, 10))
    .order("data_avaliacao", { ascending: true })
    .limit(30)

  /* O que a AUTOMÁTICA vai responder não entra no popup: loja ligada + nota
     escolhida pelo cliente + ainda não recusada pela IA. Pedir pra pessoa
     responder o que a máquina responde amanhã cedo é trabalho em dobro — e
     a pessoa responderia primeiro. O que a automática recusou (saúde,
     higiene, item faltando...) VOLTA pro popup: é exatamente pra isso. */
  const holdingId = await getCurrentHoldingId()
  const admin = createAdminClient()
  const [{ data: h }, { data: ligadas }] = await Promise.all([
    admin.from("holdings").select("resposta_auto_notas").eq("id", holdingId ?? "").maybeSingle(),
    admin
      .from("units")
      .select("id")
      .in(
        "id",
        minhas.map((u) => u.id),
      )
      .eq("resposta_auto_avaliacoes", true),
  ])
  const { notasDoCliente } = await import("@/lib/avaliacoes/resposta-automatica")
  const notasAuto = new Set(notasDoCliente(h?.resposta_auto_notas as number[] | null))
  const lojasAuto = new Set((ligadas ?? []).map((u) => u.id as string))

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const itens: AvaliacaoRuim[] = (data ?? [])
    .filter(
      (r) =>
        !(
          lojasAuto.has(r.unit_id as string) &&
          notasAuto.has(Number(r.nota)) &&
          !r.resposta_auto_pulada
        ),
    )
    .map((r) => {
    const d = new Date(`${r.data_avaliacao}T00:00:00`)
    const dias = Math.round((hoje.getTime() - d.getTime()) / 86_400_000)
    const u = porId.get(r.unit_id as string)!
    return {
      avaliacaoId: r.id as string,
      unitId: r.unit_id as string,
      loja: u.name,
      code: u.code,
      nota: Number(r.nota),
      comentario: textoOuNull(r.comentario as string | null),
      tagsNegativas: (r.tags_negativas as string[] | null) ?? [],
      dataAvaliacao: String(r.data_avaliacao),
      diasRestantes: prazo - dias,
    }
  })
  const ia = itens.length > 0 ? await getIaStatus() : null
  return { itens, podeIa: !!ia?.podeUsar }
}
