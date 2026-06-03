"use server"

import { revalidatePath } from "next/cache"

import { requireModulePermission } from "@/lib/auth/guards"
import { getRecebidoSemana, type RecebidoSemana } from "@/lib/data/fechamentos"
import {
  computeVinagreteRef,
  normCat,
  type VinagreteRef,
} from "@/lib/data/produtos-vendidos"
import { parseProdutosVendidos } from "@/lib/import/produtos-vendidos"

export type FechamentoState = { ok: boolean; message?: string }

/** Soma do importado na semana — SÓ pra conferência (cinza no form). */
export async function prefillRecebido(
  unitId: string,
  inicio: string,
  fim: string,
): Promise<{ ok: boolean; data?: RecebidoSemana }> {
  try {
    await requireModulePermission("financeiro", "view")
    if (!unitId || !inicio || !fim) return { ok: false }
    const data = await getRecebidoSemana(unitId, inicio, fim)
    return { ok: true, data }
  } catch {
    return { ok: false }
  }
}

export async function saveFechamento(input: {
  unitId: string
  unitCode: string
  periodoInicio: string
  periodoFim: string
  recebidoIfood: number
  recebidoKeeta: number
  recebido99: number
  vr: number
  custoProdutos: number
  custoVinagrete: number
  acerto: Record<string, unknown>
  observacoes: string
}): Promise<FechamentoState> {
  try {
    const { admin, userId } = await requireModulePermission("financeiro", "edit")

    if (!input.unitId || !input.periodoInicio || !input.periodoFim) {
      return { ok: false, message: "Escolha a semana (início e fim)." }
    }
    if (input.periodoFim < input.periodoInicio) {
      return { ok: false, message: "Fim da semana antes do início." }
    }

    // Valores ≥ 0, exceto VR que pode ser negativo (ajuste).
    const pos = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0)
    const any = (n: number) => (Number.isFinite(n) ? n : 0)

    const { error } = await admin.from("unit_fechamentos").upsert(
      {
        unit_id: input.unitId,
        periodo_inicio: input.periodoInicio,
        periodo_fim: input.periodoFim,
        recebido_ifood: pos(input.recebidoIfood),
        recebido_keeta: pos(input.recebidoKeeta),
        recebido_99: pos(input.recebido99),
        credito_debito: any(input.vr), // coluna reaproveitada como VR
        custo_produtos: pos(input.custoProdutos),
        custo_vinagrete: pos(input.custoVinagrete),
        acerto: input.acerto ?? {},
        observacoes: input.observacoes?.trim() || null,
        created_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "unit_id,periodo_inicio,periodo_fim" },
    )
    if (error) return { ok: false, message: error.message }

    revalidatePath(`/unidades/${input.unitCode}`)
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Erro desconhecido",
    }
  }
}

export async function deleteFechamento(
  id: string,
  unitCode: string,
): Promise<FechamentoState> {
  try {
    const { admin } = await requireModulePermission("financeiro", "edit")
    if (!id) return { ok: false, message: "ID ausente." }
    const { error } = await admin
      .from("unit_fechamentos")
      .delete()
      .eq("id", id)
    if (error) return { ok: false, message: error.message }
    revalidatePath(`/unidades/${unitCode}`)
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Erro desconhecido",
    }
  }
}

// ─── Vinagrete pela planilha "Produtos vendidos" do JK ──────────────────

/** Referência (cinza) do vinagrete pra uma semana, a partir do importado. */
export async function getVinagreteReference(
  unitId: string,
  inicio: string,
  fim: string,
): Promise<{ ok: boolean; ref?: VinagreteRef }> {
  try {
    await requireModulePermission("financeiro", "view")
    if (!unitId || !inicio || !fim) return { ok: false }
    const ref = await computeVinagreteRef(unitId, inicio, fim)
    return { ok: true, ref }
  } catch {
    return { ok: false }
  }
}

/** Sobe a planilha do JK: soma por categoria, salva e devolve o detalhamento. */
export async function importProdutosVendidos(
  formData: FormData,
): Promise<{
  ok: boolean
  message?: string
  ref?: VinagreteRef
  periodoInicio?: string
  periodoFim?: string
}> {
  try {
    const { admin } = await requireModulePermission("financeiro", "edit")
    const unitId = String(formData.get("unitId") || "")
    const unitCode = String(formData.get("unitCode") || "")
    const file = formData.get("file")
    if (!unitId) return { ok: false, message: "Unidade inválida." }
    if (!(file instanceof File) || file.size === 0)
      return { ok: false, message: "Arquivo inválido." }
    if (file.size > 30 * 1024 * 1024)
      return { ok: false, message: "Arquivo muito grande (limite 30MB)." }

    const buf = await file.arrayBuffer()
    const parsed = parseProdutosVendidos(buf)
    if (parsed.reportType !== "produtos_vendidos")
      return { ok: false, message: parsed.error }

    const { periodoInicio, periodoFim, categorias } = parsed

    // Re-importar a semana: apaga e regrava (evita categoria fantasma).
    await admin
      .from("unit_produtos_vendidos")
      .delete()
      .eq("unit_id", unitId)
      .eq("periodo_inicio", periodoInicio)
      .eq("periodo_fim", periodoFim)

    const rows = categorias.map((c) => ({
      unit_id: unitId,
      periodo_inicio: periodoInicio,
      periodo_fim: periodoFim,
      categoria: c.categoria,
      quantidade: c.quantidade,
    }))
    if (rows.length > 0) {
      const { error } = await admin.from("unit_produtos_vendidos").insert(rows)
      if (error) return { ok: false, message: error.message }
    }

    // Garante uma linha de preço pra cada categoria nova (pra aparecer no painel).
    const { data: precos } = await admin
      .from("unit_categoria_precos")
      .select("categoria")
      .eq("unit_id", unitId)
    const existentes = new Set(
      (precos ?? []).map((p) => normCat(String(p.categoria))),
    )
    const novas = categorias
      .filter((c) => !existentes.has(normCat(c.categoria)))
      .map((c) => ({
        unit_id: unitId,
        categoria: c.categoria,
        preco: 0,
        considerar: normCat(c.categoria) !== "nao considerar",
      }))
    if (novas.length > 0) {
      await admin
        .from("unit_categoria_precos")
        .upsert(novas, { onConflict: "unit_id,categoria" })
    }

    const ref = await computeVinagreteRef(unitId, periodoInicio, periodoFim)
    if (unitCode) revalidatePath(`/unidades/${unitCode}`)
    return { ok: true, ref, periodoInicio, periodoFim }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Erro desconhecido",
    }
  }
}

/** Edita o preço / 'considerar' de uma categoria. */
export async function saveCategoriaPreco(input: {
  unitId: string
  unitCode: string
  categoria: string
  preco: number
  considerar: boolean
}): Promise<FechamentoState> {
  try {
    const { admin } = await requireModulePermission("financeiro", "edit")
    const categoria = input.categoria?.trim()
    if (!input.unitId || !categoria)
      return { ok: false, message: "Categoria inválida." }
    const preco = Number.isFinite(input.preco) ? Math.max(0, input.preco) : 0

    const { error } = await admin.from("unit_categoria_precos").upsert(
      {
        unit_id: input.unitId,
        categoria,
        preco,
        considerar: !!input.considerar,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "unit_id,categoria" },
    )
    if (error) return { ok: false, message: error.message }
    if (input.unitCode) revalidatePath(`/unidades/${input.unitCode}`)
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Erro desconhecido",
    }
  }
}
