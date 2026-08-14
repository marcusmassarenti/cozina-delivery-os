"use server"

import { revalidatePath } from "next/cache"

import { getAuthUser, isSuperadmin } from "@/lib/auth/permissions"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  criarProposta,
  type DadosProposta,
  type StatusProposta,
} from "@/lib/data/propostas"

export type PropostaState = { ok: boolean; message?: string; error?: string }

async function exigirDono(): Promise<string | null> {
  if (!(await isSuperadmin())) throw new Error("Apenas o admin da plataforma.")
  return (await getAuthUser())?.id ?? null
}

export async function novaProposta(
  _prev: PropostaState,
  formData: FormData,
): Promise<PropostaState & { id?: string }> {
  let userId: string | null = null
  try {
    userId = await exigirDono()
  } catch {
    return { ok: false, error: "Apenas o admin da plataforma." }
  }

  const holdingId = String(formData.get("holding_id") ?? "").trim()
  if (!holdingId) return { ok: false, error: "Escolha o cliente." }

  const r = await criarProposta(holdingId, userId)
  if ("erro" in r) return { ok: false, error: r.erro }

  revalidatePath("/propostas")
  return { ok: true, id: r.id }
}

/**
 * Salva o retrato editado.
 *
 * ⚠️ TRAVA DEPOIS DE ASSINADA. Documento assinado não se edita — se o preço
 * mudar, a saída é uma proposta NOVA, não reescrever a que o cliente já
 * assinou. Sem esta trava o sistema deixaria alterar em silêncio um documento
 * com valor jurídico, e ninguém saberia que o texto assinado é outro.
 */
export async function salvarProposta(
  id: string,
  dados: DadosProposta,
): Promise<PropostaState> {
  try {
    await exigirDono()
  } catch {
    return { ok: false, error: "Apenas o admin da plataforma." }
  }

  const admin = createAdminClient()
  const { data: atual } = await admin
    .from("propostas")
    .select("status")
    .eq("id", id)
    .maybeSingle()

  if (!atual) return { ok: false, error: "Proposta não encontrada." }
  if (atual.status === "assinada") {
    return {
      ok: false,
      error: "Proposta assinada não pode ser editada. Crie uma nova.",
    }
  }

  const { error } = await admin
    .from("propostas")
    .update({ dados, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/propostas/${id}`)
  revalidatePath("/propostas")
  return { ok: true, message: "Salvo." }
}

export async function mudarStatusProposta(
  id: string,
  status: StatusProposta,
): Promise<PropostaState> {
  try {
    await exigirDono()
  } catch {
    return { ok: false, error: "Apenas o admin da plataforma." }
  }

  const agora = new Date().toISOString()
  const extra: Record<string, string | null> = {}
  if (status === "enviada") extra.enviada_em = agora
  if (status === "assinada") extra.assinada_em = agora

  const { error } = await createAdminClient()
    .from("propostas")
    .update({ status, updated_at: agora, ...extra })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/propostas/${id}`)
  revalidatePath("/propostas")
  return { ok: true, message: "Status atualizado." }
}
