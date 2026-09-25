"use server"

import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { requireModulePermission } from "@/lib/auth/guards"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import { TIPOS } from "@/lib/data/atendimentos-tipos"

export type AtendimentoState = { ok: boolean; error?: string }

/** Nome de quem está escrevendo, pra o passo não ficar órfão na tela. */
async function quemSou(): Promise<{ id: string | null; nome: string | null }> {
  const {
    data: { user },
  } = await (await createClient()).auth.getUser()
  if (!user) return { id: null, nome: null }
  const { data } = await createAdminClient()
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle()
  return {
    id: user.id,
    nome: (data?.full_name as string | null) ?? user.email ?? null,
  }
}

/** A loja é desta agência? Nenhuma escrita passa sem isto. */
async function lojaDaHolding(unitId: string): Promise<boolean> {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return false
  const { data } = await createAdminClient()
    .from("units")
    .select("id, brands!inner(holding_id)")
    .eq("id", unitId)
    .eq("brands.holding_id", holdingId)
    .maybeSingle()
  return !!data
}

/**
 * O gestor é desta agência? `null` = sem responsável (válido).
 * Devolve o nome, que vai pro histórico quando o responsável muda.
 */
async function gestorDaHolding(
  gestorId: string,
): Promise<{ ok: boolean; nome: string | null }> {
  if (!gestorId) return { ok: true, nome: null }
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, nome: null }
  const { data } = await createAdminClient()
    .from("gestores")
    .select("nome")
    .eq("id", gestorId)
    .eq("holding_id", holdingId)
    .maybeSingle()
  return data ? { ok: true, nome: data.nome as string } : { ok: false, nome: null }
}

export async function abrirAtendimento(
  _prev: AtendimentoState,
  formData: FormData,
): Promise<AtendimentoState> {
  await requireModulePermission("unidades", "edit")
  const unitId = String(formData.get("unitId") ?? "")
  const tipo = String(formData.get("tipo") ?? "")
  const titulo = String(formData.get("titulo") ?? "").trim()
  const primeiro = String(formData.get("passo") ?? "").trim()

  if (!unitId) return { ok: false, error: "Escolha a loja." }
  if (!TIPOS.some((t) => t.id === tipo)) return { ok: false, error: "Tipo inválido." }
  if (!titulo) return { ok: false, error: "Escreva o que está sendo feito." }
  if (!(await lojaDaHolding(unitId)))
    return { ok: false, error: "Loja fora do seu acesso." }
  const gestorId = String(formData.get("gestorId") ?? "").trim()
  if (!(await gestorDaHolding(gestorId)).ok)
    return { ok: false, error: "Responsável fora da sua agência." }

  const eu = await quemSou()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("atendimentos")
    .insert({
      unit_id: unitId,
      tipo,
      titulo,
      aberto_por: eu.id,
      gestor_id: gestorId || null,
    })
    .select("id")
    .single()
  if (error) return { ok: false, error: error.message }

  if (primeiro) {
    await admin.from("atendimento_passos").insert({
      atendimento_id: data.id,
      texto: primeiro,
      autor: eu.id,
      autor_nome: eu.nome,
    })
  }
  revalidatePath("/carteira/atendimentos")
  return { ok: true }
}

export async function registrarPasso(
  _prev: AtendimentoState,
  formData: FormData,
): Promise<AtendimentoState> {
  await requireModulePermission("unidades", "edit")
  const atendimentoId = String(formData.get("atendimentoId") ?? "")
  const texto = String(formData.get("texto") ?? "").trim()
  if (!texto) return { ok: false, error: "Escreva o passo." }

  const admin = createAdminClient()
  const { data: at } = await admin
    .from("atendimentos")
    .select("unit_id")
    .eq("id", atendimentoId)
    .maybeSingle()
  if (!at) return { ok: false, error: "Atendimento não encontrado." }
  if (!(await lojaDaHolding(at.unit_id as string)))
    return { ok: false, error: "Atendimento fora do seu acesso." }

  const eu = await quemSou()
  const { error } = await admin.from("atendimento_passos").insert({
    atendimento_id: atendimentoId,
    texto,
    autor: eu.id,
    autor_nome: eu.nome,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath("/carteira/atendimentos")
  return { ok: true }
}

/**
 * Resolver e reabrir.
 *
 * Nenhum dos dois apaga passo nenhum — resolver é carimbar uma data, e
 * reabrir é limpá-la. O histórico do que foi feito continua inteiro nos dois
 * casos, que é o ponto da tela.
 */
export async function alternarResolvido(
  _prev: AtendimentoState,
  formData: FormData,
): Promise<AtendimentoState> {
  await requireModulePermission("unidades", "edit")
  const id = String(formData.get("atendimentoId") ?? "")
  const resolver = formData.get("resolver") === "1"

  const admin = createAdminClient()
  const { data: at } = await admin
    .from("atendimentos")
    .select("unit_id")
    .eq("id", id)
    .maybeSingle()
  if (!at) return { ok: false, error: "Atendimento não encontrado." }
  if (!(await lojaDaHolding(at.unit_id as string)))
    return { ok: false, error: "Atendimento fora do seu acesso." }

  const { error } = await admin
    .from("atendimentos")
    .update({ resolvido_em: resolver ? new Date().toISOString() : null })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }
  revalidatePath("/carteira/atendimentos")
  return { ok: true }
}

/**
 * Passar a tarefa pra outro gestor (ou tirar o responsável).
 *
 * A troca vira um PASSO no histórico — "Responsável: Diego → Paulo Victor",
 * com quem trocou e quando. O histórico é append-only (ver a página), e uma
 * tarefa que muda de mão sem registro reabre a pergunta "de quem era isso
 * em julho?" que a tela existe pra responder.
 */
export async function trocarResponsavel(
  _prev: AtendimentoState,
  formData: FormData,
): Promise<AtendimentoState> {
  await requireModulePermission("unidades", "edit")
  const id = String(formData.get("atendimentoId") ?? "")
  const gestorId = String(formData.get("gestorId") ?? "").trim()

  const admin = createAdminClient()
  const { data: at } = await admin
    .from("atendimentos")
    .select("unit_id, gestor_id, gestores(nome)")
    .eq("id", id)
    .maybeSingle()
  if (!at) return { ok: false, error: "Atendimento não encontrado." }
  if (!(await lojaDaHolding(at.unit_id as string)))
    return { ok: false, error: "Atendimento fora do seu acesso." }
  if ((at.gestor_id ?? "") === gestorId) return { ok: true }

  const novo = await gestorDaHolding(gestorId)
  if (!novo.ok) return { ok: false, error: "Responsável fora da sua agência." }

  const { error } = await admin
    .from("atendimentos")
    .update({ gestor_id: gestorId || null })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  const antes =
    (at.gestores as unknown as { nome: string } | null)?.nome ?? "sem responsável"
  const eu = await quemSou()
  await admin.from("atendimento_passos").insert({
    atendimento_id: id,
    texto: `Responsável: ${antes} → ${novo.nome ?? "sem responsável"}`,
    autor: eu.id,
    autor_nome: eu.nome,
  })
  revalidatePath("/carteira/atendimentos")
  return { ok: true }
}
