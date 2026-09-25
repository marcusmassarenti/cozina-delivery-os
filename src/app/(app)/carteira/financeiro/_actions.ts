"use server"

import { revalidatePath } from "next/cache"

import { requireModulePermission } from "@/lib/auth/guards"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import { createAdminClient } from "@/lib/supabase/admin"

export type FinState = { ok: boolean; error?: string }

/** "1.234,56" e "1234.56" viram 1234.56. */
function paraNumero(bruto: string): number | null {
  const s = bruto.trim()
  if (!s) return null
  const limpo = s.includes(",")
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(/\s/g, "")
  const n = Number(limpo)
  return isNaN(n) ? null : n
}

export async function lancarCobranca(
  _prev: FinState,
  formData: FormData,
): Promise<FinState> {
  await requireModulePermission("financeiro", "edit")
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, error: "Sem empresa na sessão." }

  const valor = paraNumero(String(formData.get("valor") ?? ""))
  if (valor === null || valor <= 0) return { ok: false, error: "Valor inválido." }
  const vencimento = String(formData.get("vencimento") ?? "").trim()
  if (!vencimento) return { ok: false, error: "Informe o vencimento." }

  const unitId = String(formData.get("unitId") ?? "").trim()
  if (unitId) {
    const { data } = await createAdminClient()
      .from("units")
      .select("id, brands!inner(holding_id)")
      .eq("id", unitId)
      .eq("brands.holding_id", holdingId)
      .maybeSingle()
    if (!data) return { ok: false, error: "Loja fora da sua agência." }
  }

  const { error } = await createAdminClient().from("agencia_cobrancas").insert({
    holding_id: holdingId,
    unit_id: unitId || null,
    // Competência é o mês a que a cobrança se refere; sem ela, usa o
    // vencimento — que é o palpite certo na esmagadora maioria.
    competencia:
      String(formData.get("competencia") ?? "").trim() ||
      `${vencimento.slice(0, 7)}-01`,
    valor,
    vencimento,
    pago_em: String(formData.get("pagoEm") ?? "").trim() || null,
    observacao: String(formData.get("observacao") ?? "").trim() || null,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath("/carteira/financeiro")
  return { ok: true }
}

export async function lancarDespesa(
  _prev: FinState,
  formData: FormData,
): Promise<FinState> {
  await requireModulePermission("financeiro", "edit")
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, error: "Sem empresa na sessão." }

  const valor = paraNumero(String(formData.get("valor") ?? ""))
  if (valor === null || valor <= 0) return { ok: false, error: "Valor inválido." }
  const descricao = String(formData.get("descricao") ?? "").trim()
  if (!descricao) return { ok: false, error: "Descreva a despesa." }
  const vencimento = String(formData.get("vencimento") ?? "").trim()
  if (!vencimento) return { ok: false, error: "Informe o vencimento." }

  const { error } = await createAdminClient().from("agencia_despesas").insert({
    holding_id: holdingId,
    categoria: String(formData.get("categoria") ?? "").trim() || "Outros",
    descricao,
    valor,
    vencimento,
    pago_em: String(formData.get("pagoEm") ?? "").trim() || null,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath("/carteira/financeiro")
  return { ok: true }
}

/** Baixa e estorno de baixa — a mesma ação, porque desfazer tem que existir. */
export async function alternarPago(
  _prev: FinState,
  formData: FormData,
): Promise<FinState> {
  await requireModulePermission("financeiro", "edit")
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, error: "Sem empresa na sessão." }

  const id = String(formData.get("id") ?? "")
  const tabela =
    formData.get("tipo") === "despesa" ? "agencia_despesas" : "agencia_cobrancas"
  const pagar = formData.get("pagar") === "1"

  const { error } = await createAdminClient()
    .from(tabela)
    .update({
      pago_em: pagar
        ? new Date().toLocaleDateString("en-CA", {
            timeZone: "America/Sao_Paulo",
          })
        : null,
    })
    .eq("id", id)
    // ⚠️ A holding entra no WHERE, não só na leitura: sem isso um id colado
    // dava baixa na cobrança de outra agência.
    .eq("holding_id", holdingId)
  if (error) return { ok: false, error: error.message }
  revalidatePath("/carteira/financeiro")
  return { ok: true }
}

/**
 * Editar o que já foi lançado (pedido do Marcus, 25/09/26 — "depois que eu
 * lanço não consigo mexer, eu tenho que dar baixa").
 *
 * Mesmas regras do lançamento, e a holding no WHERE: sem ela, um id colado
 * editaria o lançamento de outra agência. Competência da cobrança acompanha
 * o vencimento, como no lançamento.
 */
export async function editarCobranca(
  _prev: FinState,
  formData: FormData,
): Promise<FinState> {
  await requireModulePermission("financeiro", "edit")
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, error: "Sem empresa na sessão." }

  const id = String(formData.get("id") ?? "")
  if (!id) return { ok: false, error: "Cobrança não encontrada." }
  const valor = paraNumero(String(formData.get("valor") ?? ""))
  if (valor === null || valor <= 0) return { ok: false, error: "Valor inválido." }
  const vencimento = String(formData.get("vencimento") ?? "").trim()
  if (!vencimento) return { ok: false, error: "Informe o vencimento." }

  const unitId = String(formData.get("unitId") ?? "").trim()
  if (unitId) {
    const { data } = await createAdminClient()
      .from("units")
      .select("id, brands!inner(holding_id)")
      .eq("id", unitId)
      .eq("brands.holding_id", holdingId)
      .maybeSingle()
    if (!data) return { ok: false, error: "Loja fora da sua agência." }
  }

  const { data, error } = await createAdminClient()
    .from("agencia_cobrancas")
    .update({
      unit_id: unitId || null,
      competencia: `${vencimento.slice(0, 7)}-01`,
      valor,
      vencimento,
      pago_em: String(formData.get("pagoEm") ?? "").trim() || null,
      observacao: String(formData.get("observacao") ?? "").trim() || null,
    })
    .eq("id", id)
    .eq("holding_id", holdingId)
    .select("id")
  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0)
    return { ok: false, error: "Cobrança não encontrada." }
  revalidatePath("/carteira/financeiro")
  return { ok: true }
}

export async function editarDespesa(
  _prev: FinState,
  formData: FormData,
): Promise<FinState> {
  await requireModulePermission("financeiro", "edit")
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, error: "Sem empresa na sessão." }

  const id = String(formData.get("id") ?? "")
  if (!id) return { ok: false, error: "Despesa não encontrada." }
  const valor = paraNumero(String(formData.get("valor") ?? ""))
  if (valor === null || valor <= 0) return { ok: false, error: "Valor inválido." }
  const descricao = String(formData.get("descricao") ?? "").trim()
  if (!descricao) return { ok: false, error: "Descreva a despesa." }
  const vencimento = String(formData.get("vencimento") ?? "").trim()
  if (!vencimento) return { ok: false, error: "Informe o vencimento." }

  const { data, error } = await createAdminClient()
    .from("agencia_despesas")
    .update({
      categoria: String(formData.get("categoria") ?? "").trim() || "Outros",
      descricao,
      valor,
      vencimento,
      pago_em: String(formData.get("pagoEm") ?? "").trim() || null,
    })
    .eq("id", id)
    .eq("holding_id", holdingId)
    .select("id")
  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0)
    return { ok: false, error: "Despesa não encontrada." }
  revalidatePath("/carteira/financeiro")
  return { ok: true }
}
