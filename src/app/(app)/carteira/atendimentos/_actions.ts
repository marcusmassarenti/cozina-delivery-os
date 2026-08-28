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

  const eu = await quemSou()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("atendimentos")
    .insert({ unit_id: unitId, tipo, titulo, aberto_por: eu.id })
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
