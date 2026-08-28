"use server"

import { revalidatePath } from "next/cache"

import { requireModulePermission } from "@/lib/auth/guards"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import { createAdminClient } from "@/lib/supabase/admin"
import { STATUS } from "@/lib/data/carteira-onboarding-tipos"

export type OnboardingState = { ok: boolean; error?: string }

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

export async function salvarOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  await requireModulePermission("unidades", "edit")
  const unitId = String(formData.get("unitId") ?? "")
  if (!(await lojaDaHolding(unitId)))
    return { ok: false, error: "Loja fora do seu acesso." }

  const status = String(formData.get("status") ?? "")
  if (status && !STATUS.some((s) => s.id === status))
    return { ok: false, error: "Status inválido." }

  const reuniao = String(formData.get("reuniao") ?? "").trim()
  const link = String(formData.get("link") ?? "").trim()

  /* Link só entra se for http(s). Campo livre que vira `href` é como se
     produz um `javascript:` clicável na tela de quem confiou no cadastro. */
  if (link && !/^https?:\/\//i.test(link))
    return { ok: false, error: "O link da reunião precisa começar com https://" }

  const { error } = await createAdminClient()
    .from("units")
    .update({
      sucesso_responsavel:
        String(formData.get("responsavel") ?? "").trim() || null,
      onboarding_status: status || null,
      onboarding_reuniao_em: reuniao ? new Date(reuniao).toISOString() : null,
      onboarding_link: link || null,
      onboarding_observacoes:
        String(formData.get("observacoes") ?? "").trim() || null,
    })
    .eq("id", unitId)
  if (error) return { ok: false, error: error.message }

  revalidatePath("/carteira/onboarding")
  return { ok: true }
}

/**
 * Registra a venda: quem vendeu, quando e por quanto.
 *
 * ⚠️ `mensalidade` é o que a AGÊNCIA cobra pela loja, não o faturamento
 * dela. Os dois moram em `units` e o nome parecido já confundiu no painel de
 * origem — por isso a tela escreve "mensalidade da agência" por extenso.
 */
export async function salvarVenda(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  await requireModulePermission("unidades", "edit")
  const unitId = String(formData.get("unitId") ?? "")
  if (!(await lojaDaHolding(unitId)))
    return { ok: false, error: "Loja fora do seu acesso." }

  const vendedorId = String(formData.get("vendedorId") ?? "").trim()
  const dataVenda = String(formData.get("dataVenda") ?? "").trim()
  const bruto = String(formData.get("mensalidade") ?? "").trim()
  const mensalidade = bruto
    ? Number(bruto.replace(/\./g, "").replace(",", "."))
    : null
  if (mensalidade !== null && (isNaN(mensalidade) || mensalidade < 0))
    return { ok: false, error: "Mensalidade inválida." }

  const admin = createAdminClient()
  if (vendedorId) {
    // O vendedor tem que ser DESTA agência — id colado no payload não vale.
    const holdingId = await getCurrentHoldingId()
    const { data: v } = await admin
      .from("vendedores")
      .select("id")
      .eq("id", vendedorId)
      .eq("holding_id", holdingId!)
      .maybeSingle()
    if (!v) return { ok: false, error: "Vendedor fora da sua agência." }
  }

  const { error } = await admin
    .from("units")
    .update({
      vendedor_id: vendedorId || null,
      data_venda: dataVenda || null,
      mensalidade,
    })
    .eq("id", unitId)
  if (error) return { ok: false, error: error.message }

  revalidatePath("/carteira/onboarding")
  revalidatePath("/carteira/comercial")
  return { ok: true }
}

export async function criarVendedor(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  await requireModulePermission("unidades", "edit")
  const nome = String(formData.get("nome") ?? "").trim()
  if (!nome) return { ok: false, error: "Escreva o nome." }

  // A holding vem da SESSÃO, nunca do formulário — mesma trava dos gestores.
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, error: "Sem empresa na sessão." }

  const { error } = await createAdminClient()
    .from("vendedores")
    .insert({ holding_id: holdingId, nome })
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "Já existe um vendedor com esse nome." : error.message,
    }
  }
  revalidatePath("/carteira/comercial")
  revalidatePath("/carteira/onboarding")
  return { ok: true }
}
