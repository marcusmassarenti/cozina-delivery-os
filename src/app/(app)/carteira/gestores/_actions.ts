"use server"

import { revalidatePath } from "next/cache"

import { requireModulePermission } from "@/lib/auth/guards"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import { createAdminClient } from "@/lib/supabase/admin"

export type GestorState = { ok: boolean; message?: string; error?: string }

/**
 * Cria um gestor na agência do usuário logado.
 *
 * ⚠️ A HOLDING VEM DA SESSÃO, NUNCA DO FORMULÁRIO. Aceitar `holdingId` do
 * cliente deixaria qualquer um criar gestor na carteira de outra agência
 * mandando outro id no payload — e carteira de cliente misturada é o erro
 * mais caro deste sistema.
 */
export async function criarGestor(
  _prev: GestorState,
  formData: FormData,
): Promise<GestorState> {
  await requireModulePermission("unidades", "edit")
  const nome = String(formData.get("nome") ?? "").trim()
  if (!nome) return { ok: false, error: "Digite o nome do gestor." }
  if (nome.length > 80) return { ok: false, error: "Nome muito longo." }

  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, error: "Não consegui identificar a empresa." }

  const { error } = await createAdminClient()
    .from("gestores")
    .insert({ holding_id: holdingId, nome })
  if (error) {
    // 23505 = unique (holding_id, nome). A trava existe porque dois gestores
    // com o mesmo nome partem a carteira em dois e o ranking mente.
    if (error.code === "23505") {
      return { ok: false, error: `Já existe um gestor chamado "${nome}".` }
    }
    return { ok: false, error: error.message }
  }
  revalidatePath("/carteira/gestores")
  return { ok: true, message: `${nome} cadastrado.` }
}

/** Liga ou desliga uma loja da carteira de um gestor. */
export async function atribuirLoja(
  _prev: GestorState,
  formData: FormData,
): Promise<GestorState> {
  await requireModulePermission("unidades", "edit")
  const unitId = String(formData.get("unitId") ?? "").trim()
  const gestorId = String(formData.get("gestorId") ?? "").trim()
  if (!unitId) return { ok: false, error: "Loja não identificada." }

  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, error: "Não consegui identificar a empresa." }
  const admin = createAdminClient()

  /* ⚠️ CONFERE QUE A LOJA E O GESTOR SÃO DA MESMA AGÊNCIA.
   *
   * Sem isto, um id de loja de outro cliente vindo no payload entraria na
   * carteira daqui. É a mesma família de defeito que a tela de merchants
   * tinha em 28/08/26, quando o seletor oferecia loja de qualquer empresa. */
  const { data: loja } = await admin
    .from("units")
    .select("id, brands!inner(holding_id)")
    .eq("id", unitId)
    .maybeSingle()
  const daLoja = (loja as unknown as { brands?: { holding_id?: string } } | null)
    ?.brands?.holding_id
  if (daLoja !== holdingId) {
    return { ok: false, error: "Essa loja não é da sua empresa." }
  }

  if (gestorId) {
    const { data: g } = await admin
      .from("gestores")
      .select("id")
      .eq("id", gestorId)
      .eq("holding_id", holdingId)
      .maybeSingle()
    if (!g) return { ok: false, error: "Gestor não encontrado nesta empresa." }
  }

  const { error } = await admin
    .from("units")
    .update({
      gestor_id: gestorId || null,
      /* Carimba a entrada na carteira na PRIMEIRA atribuição e não mexe
         depois: ela mede há quanto tempo a agência cuida da loja, e trocar
         de gestor não zera esse relógio. */
      ...(gestorId ? {} : { entrada_carteira: null }),
    })
    .eq("id", unitId)
  if (error) return { ok: false, error: error.message }

  if (gestorId) {
    await admin
      .from("units")
      .update({ entrada_carteira: new Date().toISOString().slice(0, 10) })
      .eq("id", unitId)
      .is("entrada_carteira", null)
  }

  revalidatePath("/carteira/gestores")
  revalidatePath("/unidades")
  return { ok: true, message: gestorId ? "Loja atribuída." : "Loja removida da carteira." }
}
