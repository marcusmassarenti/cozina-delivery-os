import { createAdminClient } from "@/lib/supabase/admin"
import { getVisibleUnits } from "@/lib/data/units"
import { getUnidadesSomenteLeitura, userCan } from "@/lib/auth/permissions"
import { adicionalRespostaAuto } from "@/lib/data/adicional-resposta-auto"
import { notasDoCliente } from "@/lib/avaliacoes/resposta-automatica"
import { getCurrentHoldingBilling } from "@/lib/data/billing"
import { getCurrentHoldingId } from "@/lib/auth/permissions"

import { RespostaAutomaticaControles } from "./resposta-automatica-controles"

/**
 * Resposta automática das notas 4 e 5 — onde a loja liga, e o que ela fez.
 *
 * Mostra EXEMPLOS reais antes de ligar: ninguém deveria autorizar texto
 * publicado em nome da loja sem ver como ele é.
 *
 * Só aparece pra quem pode responder e tem ao menos uma loja com a API do
 * iFood — é a única plataforma que aceita resposta pela API.
 */
export async function RespostaAutomaticaCard() {
  if (!(await userCan("avaliacoes", "edit"))) return null

  const [units, emprestadas] = await Promise.all([
    getVisibleUnits(),
    getUnidadesSomenteLeitura(),
  ])
  const minhas = units.filter((u) => u.active && !emprestadas.has(u.id))
  if (minhas.length === 0) return null

  const admin = createAdminClient()
  const ids = minhas.map((u) => u.id)
  const [{ data: comApi }, { data: flags }] = await Promise.all([
    admin
      .from("unit_platforms")
      .select("unit_id")
      .eq("platform", "ifood")
      .not("api_store_id", "is", null)
      .in("unit_id", ids),
    admin.from("units").select("id, resposta_auto_avaliacoes").in("id", ids),
  ])
  const apiSet = new Set((comApi ?? []).map((r) => r.unit_id as string))
  const ligada = new Map(
    (flags ?? []).map((r) => [r.id as string, !!r.resposta_auto_avaliacoes]),
  )
  const lojas = minhas
    .filter((u) => apiSet.has(u.id))
    .map((u) => ({ id: u.id, code: u.code, name: u.name, ativa: ligada.get(u.id) ?? false }))
  if (lojas.length === 0) return null

  // O que a automática fez nos últimos 30 dias, nas lojas visíveis.
  const desde = new Date()
  desde.setDate(desde.getDate() - 30)
  const { data: feitas } = await admin
    .from("ifood_avaliacoes")
    .select("resposta_origem, resposta_auto_pulada")
    .in(
      "unit_id",
      lojas.map((l) => l.id),
    )
    .gte("data_avaliacao", desde.toISOString().slice(0, 10))
    .or("resposta_origem.in.(modelo,ia),resposta_auto_pulada.not.is.null")
    .limit(5000)
  const modelo = (feitas ?? []).filter((r) => r.resposta_origem === "modelo").length
  const porIa = (feitas ?? []).filter((r) => r.resposta_origem === "ia").length
  const puladas = (feitas ?? []).filter(
    (r) => !r.resposta_origem && r.resposta_auto_pulada,
  ).length

  /* Exemplos REAIS do ensaio de 25/09/26 (avaliações do CnP): o iFood só
     deixa responder avaliação com comentário, então é assim que as respostas
     saem — e o terceiro mostra o que a automática deixa pra pessoa. */
  const exemplos = [
    {
      nota: 5,
      comentario: "Muito bom, comida leve e gostosa",
      resposta:
        "Que bom saber que gostou! Ficamos felizes com o retorno sobre a comida leve e gostosa. Até a próxima! 😊",
    },
    {
      nota: 3,
      comentario: "Pouco recheio",
      resposta:
        "Sentimos muito que o recheio tenha ficado abaixo do esperado. Vamos repassar esse ponto para a cozinha. Obrigado pelo retorno!",
    },
    {
      nota: 1,
      comentario: "Assim que abri subiu um cheiro de estragado",
      resposta: null,
    },
  ]

  // Preço do adicional (por loja ligada) e se a conta está no teste grátis —
  // no teste liga sem cobrar; depois entra na mensalidade.
  const holdingId = await getCurrentHoldingId()
  const [adicional, billing, { data: hIa }] = await Promise.all([
    holdingId ? adicionalRespostaAuto(holdingId) : null,
    getCurrentHoldingBilling(),
    admin
      .from("holdings")
      .select("ia_habilitada, resposta_auto_notas")
      .eq("id", holdingId ?? "")
      .maybeSingle(),
  ])

  return (
    <RespostaAutomaticaControles
      lojas={lojas}
      iaDesligada={hIa?.ia_habilitada === false}
      exemplos={exemplos}
      feitas={{ modelo, ia: porIa, puladas }}
      precoLoja={adicional?.precoLoja ?? 0}
      emTeste={billing?.status === "trial"}
      notas={notasDoCliente(hIa?.resposta_auto_notas as number[] | null)}
    />
  )
}
