"use server"

/**
 * Solicitação de ativação do iFood via API — lado do CLIENTE.
 *
 * O app do iFood é centralizado: não existe código self-service. O que o
 * cliente pode fazer é PEDIR a conexão informando o CNPJ da loja; a
 * solicitação real acontece no Portal do Desenvolvedor (feita pelo admin
 * da plataforma) e a aprovação final é do Proprietário, no Portal do
 * Parceiro dele. Esta action só registra o pedido na fila.
 */
import { revalidatePath } from "next/cache"

import { requireAdmin } from "@/lib/auth/guards"
import { normalizarCnpj } from "@/lib/cnpj"
import {
  getAccessibleUnitIds,
  getCurrentHoldingId,
} from "@/lib/auth/permissions"
import { avisarSolicitacaoIfood } from "@/lib/ifood/avisar-solicitacao"

export type SolicitacaoIfoodState = {
  ok: boolean
  message?: string
}

export async function solicitarAtivacaoIfood(
  _prev: SolicitacaoIfoodState,
  formData: FormData,
): Promise<SolicitacaoIfoodState> {
  let userId: string
  let admin: Awaited<ReturnType<typeof requireAdmin>>["admin"]
  try {
    const auth = await requireAdmin()
    userId = auth.userId
    admin = auth.admin
  } catch {
    return {
      ok: false,
      message: "Só administradores podem solicitar a conexão.",
    }
  }

  const holdingId = await getCurrentHoldingId()
  if (!holdingId) {
    return { ok: false, message: "Não consegui identificar a sua empresa." }
  }

  // "cnpj_api" vem do bloco dentro do cadastro (Editar unidade), que já tem
  // um campo "cnpj" próprio (o do cadastro) — nome distinto evita colisão.
  const cnpj = normalizarCnpj(
    String(formData.get("cnpj_api") ?? formData.get("cnpj") ?? ""),
  )
  if (!cnpj) {
    return {
      ok: false,
      message:
        "Esse CNPJ não é válido — algum número está trocado. Confira no cartão CNPJ e digite de novo.",
    }
  }

  // O pedido nasce DA página da unidade, então ela é obrigatória — e
  // precisa ser uma unidade que o usuário realmente enxerga.
  const unitId = String(formData.get("unit_id") ?? "").trim()
  if (!unitId) return { ok: false, message: "Unidade não informada." }
  const acessiveis = await getAccessibleUnitIds()
  if (acessiveis !== null && !acessiveis.includes(unitId)) {
    return { ok: false, message: "Unidade inválida." }
  }

  // Evita pedido duplicado do mesmo CNPJ ainda em andamento.
  const { data: aberta } = await admin
    .from("ifood_activation_requests")
    .select("id, status")
    .eq("holding_id", holdingId)
    .eq("cnpj", cnpj)
    .in("status", ["pendente", "solicitada"])
    .maybeSingle()
  if (aberta) {
    return {
      ok: false,
      message:
        aberta.status === "pendente"
          ? "Já existe uma solicitação em análise para esse CNPJ."
          : "Esse CNPJ já foi solicitado — falta aprovar no seu Portal do Parceiro.",
    }
  }

  const { error } = await admin.from("ifood_activation_requests").insert({
    holding_id: holdingId,
    unit_id: unitId,
    cnpj,
    requested_by: userId,
  })
  if (error) {
    return { ok: false, message: `Falha ao registrar: ${error.message}` }
  }

  // Sem await: o cliente não espera o Resend pra ver que o pedido entrou.
  void avisarSolicitacaoIfood(holdingId, { tipo: "pedido", cnpj, unitId })

  revalidatePath("/unidades")
  return {
    ok: true,
    message:
      "Solicitação registrada! Vamos conectar sua loja e você acompanha o status aqui.",
  }
}

/**
 * O CLIENTE avisa que já aprovou a conexão no Portal do Parceiro dele —
 * carimba `cliente_confirmou_at` na solicitação `solicitada` da unidade.
 * Isso acende um sinal no painel do admin (hora de vincular). Só o dono da
 * conta (admin da holding) confirma, e só numa unidade que ele enxerga.
 */
export async function confirmarAprovacaoIfood(
  _prev: SolicitacaoIfoodState,
  formData: FormData,
): Promise<SolicitacaoIfoodState> {
  let admin: Awaited<ReturnType<typeof requireAdmin>>["admin"]
  try {
    admin = (await requireAdmin()).admin
  } catch {
    return { ok: false, message: "Só administradores podem confirmar." }
  }
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, message: "Empresa não identificada." }

  const unitId = String(formData.get("unit_id") ?? "").trim()
  if (!unitId) return { ok: false, message: "Unidade não informada." }
  const acessiveis = await getAccessibleUnitIds()
  if (acessiveis !== null && !acessiveis.includes(unitId)) {
    return { ok: false, message: "Unidade inválida." }
  }

  const { error } = await admin
    .from("ifood_activation_requests")
    .update({ cliente_confirmou_at: new Date().toISOString() })
    .eq("holding_id", holdingId)
    .eq("unit_id", unitId)
    .eq("status", "solicitada")
    .is("cliente_confirmou_at", null)
  if (error) return { ok: false, message: `Falha: ${error.message}` }

  void avisarSolicitacaoIfood(holdingId, { tipo: "aprovacao", lojas: 1, unitId })

  revalidatePath("/inicio")
  revalidatePath("/unidades")
  return { ok: true, message: "Avisamos a equipe — falta pouco!" }
}

/**
 * Mesma confirmação, mas para TODAS as lojas pendentes de uma vez.
 *
 * O Proprietário aprova as lojas em sequência no Portal do Parceiro, então
 * confirmar uma a uma virava 7 cliques repetindo a mesma informação.
 */
export async function confirmarTodasAprovacoesIfood(
  _prev: SolicitacaoIfoodState,
  _formData: FormData,
): Promise<SolicitacaoIfoodState> {
  let admin: Awaited<ReturnType<typeof requireAdmin>>["admin"]
  try {
    admin = (await requireAdmin()).admin
  } catch {
    return { ok: false, message: "Só administradores podem confirmar." }
  }
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, message: "Empresa não identificada." }

  // Escopado à holding E às unidades que a pessoa enxerga — confirmar em lote
  // não pode virar atalho pra tocar em loja fora do alcance dela.
  const acessiveis = await getAccessibleUnitIds()

  let q = admin
    .from("ifood_activation_requests")
    .update({ cliente_confirmou_at: new Date().toISOString() })
    .eq("holding_id", holdingId)
    .eq("status", "solicitada")
    .is("cliente_confirmou_at", null)
  if (acessiveis !== null) q = q.in("unit_id", acessiveis)

  const { data, error } = await q.select("id")
  if (error) return { ok: false, message: `Falha: ${error.message}` }

  const n = (data ?? []).length
  // Só avisa se alguma coisa mudou de fato — confirmar em lote sem nada
  // pendente é clique inofensivo, e e-mail de "0 lojas" é ruído.
  if (n > 0)
    void avisarSolicitacaoIfood(holdingId, {
      tipo: "aprovacao",
      lojas: n,
      unitId: null,
    })
  revalidatePath("/inicio")
  revalidatePath("/unidades")
  return {
    ok: true,
    message:
      n > 0
        ? `Avisamos a equipe sobre ${n} loja${n > 1 ? "s" : ""} — falta pouco!`
        : "Nada pendente de confirmação.",
  }
}

/** Situação da conexão iFood de UMA loja do cliente, pro aviso na home. */
export type MinhaSolicitacao = {
  id: string
  unitId: string
  unitCode: string | null
  unitName: string
  status: "pendente" | "solicitada" | "ativa" | "recusada"
  clienteConfirmou: boolean
  atualizadaEm: string
  /** O motivo escrito na recusa — é o que a pessoa precisa ler pra agir. */
  nota: string | null
  /**
   * Já chegou algum lançamento do iFood pra esta loja.
   *
   * Conectar e receber o dado são momentos DIFERENTES, e a distância entre os
   * dois é de horas: o vínculo é imediato, mas quem baixa o extrato e o
   * histórico é o cron da manhã seguinte. Sem separar os dois estados, o
   * cliente recebia "conectada! 🎉" e abria um dashboard vazio — a leitura
   * óbvia é que quebrou, não que está a caminho.
   */
  temDado: boolean
}

/**
 * Solicitações de conexão iFood do PRÓPRIO cliente (escopo dele), pro aviso
 * na tela inicial: "falta você aprovar" / "sua loja foi conectada" / "não deu
 * certo, e por quê". Superadmin não usa (tem o painel).
 *
 * ⚠️ 'recusada' entra AQUI. Ela ficava de fora e o resultado era o pior
 * possível: o pedido simplesmente sumia da home e o cliente continuava
 * esperando por uma conexão que não vinha, sem nunca saber que foi recusada —
 * a explicação existia, mas só aparecia se ele entrasse na página daquela loja.
 */
export async function getMinhasSolicitacoesIfood(): Promise<MinhaSolicitacao[]> {
  const { isSuperadmin, getVerComoHoldingId } = await import(
    "@/lib/auth/permissions"
  )
  // Superadmin não vê o aviso do cliente -- ele tem o painel. MAS o "ver como
  // o cliente" precisa mostrar: era exatamente por aqui que a faixa sumia.
  // Quem é dono da plataforma continua sendo superadmin dentro do modo, então
  // `isSuperadmin()` sozinho escondia o aviso justamente no único caminho que
  // existe pra conferir a conta de um cliente. A pergunta certa não é "sou
  // superadmin?", é "estou agindo como a plataforma agora?".
  const verComo = await getVerComoHoldingId()
  if (!verComo && (await isSuperadmin())) return []
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return []
  const acessiveis = await getAccessibleUnitIds()
  if (acessiveis !== null && acessiveis.length === 0) return []

  const { createAdminClient } = await import("@/lib/supabase/admin")
  const db = createAdminClient()
  let q = db
    .from("ifood_activation_requests")
    .select(
      "id, unit_id, status, nota, cliente_confirmou_at, updated_at, units(code, name)",
    )
    .eq("holding_id", holdingId)
    .in("status", ["solicitada", "ativa", "recusada"])
    .order("updated_at", { ascending: false })
  if (acessiveis !== null) q = q.in("unit_id", acessiveis)
  const { data } = await q
  const linhas = ((data ?? []) as unknown as {
    id: string
    unit_id: string
    status: MinhaSolicitacao["status"]
    nota: string | null
    cliente_confirmou_at: string | null
    updated_at: string
    units: { code: string; name: string } | null
  }[])

  // Quais dessas lojas JÁ têm lançamento do iFood. Uma consulta pro lote todo,
  // não uma por loja: a DG FOODS abre esta tela com 47 solicitações.
  //
  // `head: true` + `limit(1)` por loja seria 47 idas ao banco; aqui vem o
  // conjunto de unit_ids que têm ao menos uma linha, de uma vez. O `distinct`
  // não existe no PostgREST, então o Set em memória faz esse papel — e a
  // consulta é barata porque só devolve a coluna do índice.
  const comDado = new Set<string>()
  const ativas = linhas.filter((s) => s.status === "ativa").map((s) => s.unit_id)
  if (ativas.length > 0) {
    const { data: cds } = await db
      .from("ifood_financeiro_lancamentos")
      .select("unit_id")
      .in("unit_id", ativas)
      .limit(2000)
    for (const r of (cds ?? []) as { unit_id: string }[]) comDado.add(r.unit_id)
  }

  return linhas.map((s) => ({
    id: s.id,
    unitId: s.unit_id,
    unitCode: s.units?.code ?? null,
    unitName: s.units?.name ?? "sua loja",
    status: s.status,
    clienteConfirmou: !!s.cliente_confirmou_at,
    atualizadaEm: s.updated_at,
    nota: s.nota ?? null,
    temDado: comDado.has(s.unit_id),
  }))
}

/**
 * "Essa loja não apareceu" — o cliente devolve a solicitação pra fila.
 *
 * Existe por causa de um buraco real: a solicitação de verdade é feita à mão no
 * Portal do Desenvolvedor, um CNPJ por vez. Num lote de 14 lojas é questão de
 * tempo até uma passar batido — e aí ela fica em 'solicitada' pra sempre. O
 * cliente aprova o que aparece no portal dele, as que faltam ninguém cobra, e
 * nenhum dos dois lados descobre: pro cliente é "ainda não conectou", pra fila
 * interna é "com o cliente".
 *
 * Voltar pra 'pendente' recoloca a linha como SUA VEZ no painel — que é o
 * único jeito de a loja esquecida reaparecer no radar de quem pode agir.
 */
export async function reportarLojaNaoApareceu(
  _prev: SolicitacaoIfoodState,
  formData: FormData,
): Promise<SolicitacaoIfoodState> {
  let admin: Awaited<ReturnType<typeof requireAdmin>>["admin"]
  try {
    admin = (await requireAdmin()).admin
  } catch {
    return { ok: false, message: "Só administradores podem reportar." }
  }
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, message: "Empresa não identificada." }

  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, message: "Solicitação não informada." }

  // Escopo duplo: a solicitação é da holding dela E de uma unidade que ela
  // enxerga. Sem isso, um id chutado mexeria na fila de outro cliente.
  const { data: alvo } = await admin
    .from("ifood_activation_requests")
    .select("id, unit_id, status")
    .eq("id", id)
    .eq("holding_id", holdingId)
    .maybeSingle()
  if (!alvo) return { ok: false, message: "Solicitação não encontrada." }
  if (alvo.status !== "solicitada") {
    return {
      ok: false,
      message: "Essa loja não está aguardando aprovação no iFood.",
    }
  }
  const acessiveis = await getAccessibleUnitIds()
  if (
    acessiveis !== null &&
    alvo.unit_id &&
    !acessiveis.includes(alvo.unit_id as string)
  ) {
    return { ok: false, message: "Unidade inválida." }
  }

  const { error } = await admin
    .from("ifood_activation_requests")
    .update({
      status: "pendente",
      status_anterior: "solicitada",
      // Zera a confirmação: ele confirmou aprovação de um lote em que ESTA
      // loja não estava. Manter o carimbo faria a fila jurar que ela já foi
      // aprovada, que é justamente a mentira que trouxe a gente até aqui.
      cliente_confirmou_at: null,
      nota: "O cliente reportou que esta loja não apareceu no Portal do Parceiro dele — refazer a solicitação no Portal do Desenvolvedor.",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) return { ok: false, message: `Falha: ${error.message}` }

  revalidatePath("/inicio")
  revalidatePath("/unidades")
  return {
    ok: true,
    message: "Avisamos a equipe — vamos refazer a solicitação dessa loja.",
  }
}
