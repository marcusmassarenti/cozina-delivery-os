"use server"

import { revalidatePath } from "next/cache"

import { requireModulePermission } from "@/lib/auth/guards"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import { createAdminClient } from "@/lib/supabase/admin"


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

  /* A etapa tem que ser DESTA agência — id colado no payload moveria a loja
     pra uma coluna de outro cliente. */
  const etapaId = String(formData.get("etapaId") ?? "").trim()
  if (etapaId) {
    const holdingId = await getCurrentHoldingId()
    const { data: e } = await createAdminClient()
      .from("carteira_etapas")
      .select("id")
      .eq("id", etapaId)
      .eq("holding_id", holdingId!)
      .maybeSingle()
    if (!e) return { ok: false, error: "Etapa fora da sua agência." }
  }

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
      etapa_id: etapaId || null,
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

/* ── AS COLUNAS DO QUADRO ─────────────────────────────────────────────── */

export async function criarEtapa(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  await requireModulePermission("unidades", "edit")
  const nome = String(formData.get("nome") ?? "").trim()
  if (!nome) return { ok: false, error: "Escreva o nome da coluna." }
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, error: "Sem empresa na sessão." }

  const admin = createAdminClient()
  const { count } = await admin
    .from("carteira_etapas")
    .select("id", { count: "exact", head: true })
    .eq("holding_id", holdingId)

  const { error } = await admin.from("carteira_etapas").insert({
    holding_id: holdingId,
    nome,
    // Entra no fim; reordenar é outro botão.
    ordem: count ?? 0,
  })
  if (error) {
    return {
      ok: false,
      error:
        error.code === "23505" ? "Já existe uma coluna com esse nome." : error.message,
    }
  }
  revalidatePath("/carteira/onboarding")
  return { ok: true }
}

/**
 * Renomear, reordenar, marcar como "conclui" e excluir.
 *
 * Excluir NÃO apaga loja: a `units.etapa_id` tem `on delete set null`, então
 * as lojas daquela coluna voltam pra "Sem etapa" e continuam na fila. Apagar
 * uma coluna do quadro nunca pode apagar trabalho de ninguém.
 */
export async function editarEtapa(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  await requireModulePermission("unidades", "edit")
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, error: "Sem empresa na sessão." }
  const id = String(formData.get("id") ?? "")
  const acao = String(formData.get("acao") ?? "")
  const admin = createAdminClient()

  if (acao === "excluir") {
    const { error } = await admin
      .from("carteira_etapas")
      .delete()
      .eq("id", id)
      .eq("holding_id", holdingId)
    if (error) return { ok: false, error: error.message }
    revalidatePath("/carteira/onboarding")
    return { ok: true }
  }

  if (acao === "conclui") {
    /* Só uma etapa por agência pode ser a de conclusão (índice único parcial
       no banco), então tira a antiga antes de pôr a nova — senão o insert
       esbarra no índice e a tela mostra um erro de banco pra uma ação que é
       legítima. */
    await admin
      .from("carteira_etapas")
      .update({ conclui: false })
      .eq("holding_id", holdingId)
      .eq("conclui", true)
    const { error } = await admin
      .from("carteira_etapas")
      .update({ conclui: true })
      .eq("id", id)
      .eq("holding_id", holdingId)
    if (error) return { ok: false, error: error.message }
    revalidatePath("/carteira/onboarding")
    return { ok: true }
  }

  const patch: Record<string, unknown> = {}
  const nome = String(formData.get("nome") ?? "").trim()
  if (nome) patch.nome = nome
  const ordem = String(formData.get("ordem") ?? "").trim()
  if (ordem) patch.ordem = Number(ordem)
  if (Object.keys(patch).length === 0) return { ok: true }

  const { error } = await admin
    .from("carteira_etapas")
    .update(patch)
    .eq("id", id)
    .eq("holding_id", holdingId)
  if (error) return { ok: false, error: error.message }
  revalidatePath("/carteira/onboarding")
  return { ok: true }
}

/** Põe uma loja no quadro — o "adicionar card". */
export async function adicionarAoQuadro(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  await requireModulePermission("unidades", "edit")
  const unitId = String(formData.get("unitId") ?? "")
  if (!unitId) return { ok: false, error: "Escolha a loja." }
  if (!(await lojaDaHolding(unitId)))
    return { ok: false, error: "Loja fora do seu acesso." }

  const holdingId = await getCurrentHoldingId()
  const { data: primeira } = await createAdminClient()
    .from("carteira_etapas")
    .select("id")
    .eq("holding_id", holdingId!)
    .order("ordem")
    .limit(1)
    .maybeSingle()

  const { error } = await createAdminClient()
    .from("units")
    .update({ etapa_id: primeira?.id ?? null })
    .eq("id", unitId)
  if (error) return { ok: false, error: error.message }
  revalidatePath("/carteira/onboarding")
  return { ok: true }
}

/** Mover o card de coluna — o arrasto do quadro, feito por clique. */
export async function moverParaEtapa(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  await requireModulePermission("unidades", "edit")
  const unitId = String(formData.get("unitId") ?? "")
  const etapaId = String(formData.get("etapaId") ?? "").trim()
  if (!(await lojaDaHolding(unitId)))
    return { ok: false, error: "Loja fora do seu acesso." }

  const holdingId = await getCurrentHoldingId()
  if (etapaId) {
    const { data: e } = await createAdminClient()
      .from("carteira_etapas")
      .select("id")
      .eq("id", etapaId)
      .eq("holding_id", holdingId!)
      .maybeSingle()
    if (!e) return { ok: false, error: "Etapa fora da sua agência." }
  }

  const { error } = await createAdminClient()
    .from("units")
    .update({ etapa_id: etapaId || null })
    .eq("id", unitId)
  if (error) return { ok: false, error: error.message }
  revalidatePath("/carteira/onboarding")
  return { ok: true }
}
