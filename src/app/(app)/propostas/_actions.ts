"use server"

import { revalidatePath } from "next/cache"

import { getAuthUser, isSuperadmin } from "@/lib/auth/permissions"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  criarProposta,
  montarDoCadastro,
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

/**
 * Recarrega os dados do CLIENTE a partir do cadastro, mantendo o comercial.
 *
 * Uma proposta é um retrato: os valores dela ficam congelados no momento em
 * que foi criada, e é assim que tem que ser — senão o PDF que o cliente
 * recebeu mudaria sozinho. Mas quando o cadastro estava incompleto na hora
 * (foi o caso da DG, sem CNPJ até o espelho do Asaas rodar), o retrato nasceu
 * errado e não havia como consertar sem refazer a proposta.
 *
 * ⚠️ SÓ os campos do cliente. Preço, plano, desconto e condições ficam como
 * estão: eles foram NEGOCIADOS, não vieram do cadastro, e sobrescrevê-los com
 * a tabela de preços apagaria o desconto combinado no telefone.
 */
export async function recarregarClienteDaProposta(
  id: string,
): Promise<PropostaState> {
  if (!(await isSuperadmin())) return { ok: false, message: "Sem permissão." }

  const admin = createAdminClient()
  const { data: p } = await admin
    .from("propostas")
    .select("holding_id, dados, status")
    .eq("id", id)
    .maybeSingle()
  if (!p) return { ok: false, message: "Proposta não encontrada." }
  if ((p as { status: string }).status === "assinada") {
    return { ok: false, message: "Proposta assinada não pode ser alterada." }
  }

  const fresco = await montarDoCadastro((p as { holding_id: string }).holding_id)
  if (!fresco) return { ok: false, message: "Cliente não encontrado." }

  const atual = (p as { dados: Record<string, unknown> }).dados
  const novo = {
    ...atual,
    razaoSocial: fresco.dados.razaoSocial,
    cnpj: fresco.dados.cnpj,
    endereco: fresco.dados.endereco,
    contatoNome: fresco.dados.contatoNome || atual.contatoNome,
    contatoEmail: fresco.dados.contatoEmail || atual.contatoEmail,
    contatoTelefone: fresco.dados.contatoTelefone || atual.contatoTelefone,
  }

  const { error } = await admin
    .from("propostas")
    .update({ dados: novo, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/propostas/${id}`)
  return { ok: true, message: "Dados do cliente atualizados." }
}
