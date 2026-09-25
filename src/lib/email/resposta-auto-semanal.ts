import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { fetchAllRows } from "@/lib/data/paginate"
import { HOLDING_DEMO_ID } from "@/lib/data/holding-demo"

import { contatoDaHolding } from "./contato-holding"
import { enviarEmail } from "./enviar"
import { respostaAutoSemana } from "./templates"

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.deliveryos.food"

/**
 * Segunda de manhã: um e-mail por cliente que teve resposta automática na
 * semana (Marcus, 25/09/26). Quem não teve nenhuma não recebe nada.
 *
 * `simular` monta tudo e NÃO envia — pra conferir destinatário e números
 * antes (lição de 04/09: o script sem modo seco reenviou o "conectado").
 */
export async function enviarResumoRespostaAuto(
  opts: { simular?: boolean } = {},
): Promise<{
  clientes: number
  enviados: number
  simulado?: { holdingId: string; para: string | null; respondidas: number }[]
  falhas: string[]
}> {
  const admin = createAdminClient()
  const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const desdeDia = desde.toISOString().slice(0, 10)

  type Linha = {
    id: string
    unit_id: string
    nota: number
    comentario: string | null
    resposta_texto: string | null
    respondida_em: string
  }
  const [respondidas, puladas] = await Promise.all([
    fetchAllRows<Linha>(
      (from, to) =>
        admin
          .from("ifood_avaliacoes")
          .select("id, unit_id, nota, comentario, resposta_texto, respondida_em")
          .in("resposta_origem", ["ia", "modelo"])
          .gte("respondida_em", desde.toISOString())
          .order("id")
          .range(from, to),
      "resposta-auto-semana",
    ),
    fetchAllRows<{ id: string; unit_id: string }>(
      (from, to) =>
        admin
          .from("ifood_avaliacoes")
          .select("id, unit_id")
          .not("resposta_auto_pulada", "is", null)
          .is("resposta_texto", null)
          .gte("data_avaliacao", desdeDia)
          .order("id")
          .range(from, to),
      "resposta-auto-semana-puladas",
    ),
  ])
  if (respondidas.length === 0) return { clientes: 0, enviados: 0, falhas: [] }

  const unitIds = [...new Set([...respondidas, ...puladas].map((r) => r.unit_id))]
  const { data: unis } = await admin
    .from("units")
    .select("id, name, brands!inner(holding_id)")
    .in("id", unitIds)
  const unidade = new Map(
    ((unis ?? []) as unknown as { id: string; name: string; brands: { holding_id: string } }[]).map(
      (u) => [u.id, { nome: u.name, holding: u.brands.holding_id }],
    ),
  )

  type Grupo = { respondidas: Linha[]; lojas: Set<string>; paraVoce: number }
  const porCliente = new Map<string, Grupo>()
  const grupo = (h: string) => {
    let g = porCliente.get(h)
    if (!g) {
      g = { respondidas: [], lojas: new Set(), paraVoce: 0 }
      porCliente.set(h, g)
    }
    return g
  }
  for (const r of respondidas) {
    const u = unidade.get(r.unit_id)
    if (!u) continue
    const g = grupo(u.holding)
    g.respondidas.push(r)
    g.lojas.add(r.unit_id)
  }
  for (const p of puladas) {
    const u = unidade.get(p.unit_id)
    if (u && porCliente.has(u.holding)) grupo(u.holding).paraVoce++
  }

  // A segunda-feira desta rodada entra no tipo: um resumo por semana.
  const segunda = new Date()
  segunda.setDate(segunda.getDate() - ((segunda.getDay() + 6) % 7))
  const semana = segunda.toISOString().slice(0, 10)

  const falhas: string[] = []
  const simulado: { holdingId: string; para: string | null; respondidas: number }[] = []
  let enviados = 0
  for (const [holdingId, g] of porCliente) {
    if (holdingId === HOLDING_DEMO_ID) continue
    const contato = await contatoDaHolding(holdingId)

    /* 3 exemplos com comentário, os mais recentes — e, se houver, pelo menos
       uma crítica: é a resposta a crítica que o dono mais quer conferir. */
    const comTexto = g.respondidas
      .filter((r) => (r.comentario ?? "").trim() && (r.resposta_texto ?? "").trim())
      .sort((a, b) => b.respondida_em.localeCompare(a.respondida_em))
    const critica = comTexto.find((r) => r.nota <= 3)
    const escolhidos = [
      ...(critica ? [critica] : []),
      ...comTexto.filter((r) => r !== critica),
    ].slice(0, 3)

    if (opts.simular) {
      simulado.push({ holdingId, para: contato?.email ?? null, respondidas: g.respondidas.length })
      continue
    }
    if (!contato) continue

    const { assunto, html } = respostaAutoSemana({
      nome: contato.nome,
      respondidas: g.respondidas.length,
      lojas: g.lojas.size,
      paraVoce: g.paraVoce,
      exemplos: escolhidos.map((r) => ({
        loja: unidade.get(r.unit_id)?.nome ?? "",
        nota: r.nota,
        comentario: (r.comentario ?? "").trim().slice(0, 280),
        resposta: (r.resposta_texto ?? "").trim(),
      })),
      url: `${SITE}/avaliacoes#respondidas`,
    })
    const r = await enviarEmail({
      holdingId,
      tipo: `resposta-auto-semana-${semana}`,
      para: contato.email,
      assunto,
      html,
    })
    if (r.ok && !r.jaEnviado) enviados++
    else if (!r.ok) falhas.push(`${holdingId}: ${r.erro ?? "erro"}`)
  }

  return {
    clientes: porCliente.size,
    enviados,
    ...(opts.simular ? { simulado } : {}),
    falhas,
  }
}
