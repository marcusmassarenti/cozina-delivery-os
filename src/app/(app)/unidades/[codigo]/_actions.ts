"use server"

import { revalidatePath } from "next/cache"

import { requireModulePermission } from "@/lib/auth/guards"
import { getRecebidoSemana, type RecebidoSemana } from "@/lib/data/fechamentos"
import {
  computeVinagreteRef,
  getProdutoPrecos,
  type ProdutoPreco,
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

/** Cadastro de preços (por código) da unidade — sempre disponível. */
export async function getProdutoPrecosAction(
  unitId: string,
): Promise<{ ok: boolean; precos?: ProdutoPreco[] }> {
  try {
    await requireModulePermission("financeiro", "view")
    if (!unitId) return { ok: false }
    const precos = await getProdutoPrecos(unitId)
    return { ok: true, precos }
  } catch {
    return { ok: false }
  }
}

/** Sobe a planilha do JK: soma por código, salva e devolve o detalhamento. */
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

    const { periodoInicio, periodoFim, produtos } = parsed

    // Re-importar a semana: apaga e regrava (evita produto fantasma).
    await admin
      .from("unit_produtos_vendidos")
      .delete()
      .eq("unit_id", unitId)
      .eq("periodo_inicio", periodoInicio)
      .eq("periodo_fim", periodoFim)

    const rows = produtos.map((p) => ({
      unit_id: unitId,
      periodo_inicio: periodoInicio,
      periodo_fim: periodoFim,
      codigo: p.codigo,
      descricao: p.descricao,
      quantidade: p.quantidade,
    }))
    if (rows.length > 0) {
      const { error } = await admin.from("unit_produtos_vendidos").insert(rows)
      if (error) return { ok: false, message: error.message }
    }

    // Cria uma linha de preço (R$ 0) pra cada código novo (pra aparecer/precificar).
    const { data: precos } = await admin
      .from("unit_produto_precos")
      .select("codigo")
      .eq("unit_id", unitId)
    const existentes = new Set((precos ?? []).map((p) => String(p.codigo)))
    const novos = produtos
      .filter((p) => !existentes.has(p.codigo))
      .map((p) => ({
        unit_id: unitId,
        codigo: p.codigo,
        descricao: p.descricao,
        preco: 0,
        considerar: true,
      }))
    if (novos.length > 0) {
      await admin
        .from("unit_produto_precos")
        .upsert(novos, { onConflict: "unit_id,codigo" })
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

/** Remove a planilha importada de uma semana (pra reimportar outra). */
export async function deleteProdutosVendidos(
  unitId: string,
  unitCode: string,
  inicio: string,
  fim: string,
): Promise<FechamentoState> {
  try {
    const { admin } = await requireModulePermission("financeiro", "edit")
    if (!unitId || !inicio || !fim)
      return { ok: false, message: "Semana inválida." }
    const { error } = await admin
      .from("unit_produtos_vendidos")
      .delete()
      .eq("unit_id", unitId)
      .eq("periodo_inicio", inicio)
      .eq("periodo_fim", fim)
    if (error) return { ok: false, message: error.message }
    if (unitCode) revalidatePath(`/unidades/${unitCode}`)
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Erro desconhecido",
    }
  }
}

/** Edita o preço / 'considerar' de uma CATEGORIA (vale pra todos os códigos). */
export async function saveCategoriaPrecoGroup(input: {
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

    const { error } = await admin
      .from("unit_produto_precos")
      .update({
        preco,
        considerar: !!input.considerar,
        updated_at: new Date().toISOString(),
      })
      .eq("unit_id", input.unitId)
      .eq("categoria", categoria)
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

/** Atribui uma categoria a um código novo (herda o preço/considerar dela). */
export async function assignProdutoCategoria(input: {
  unitId: string
  unitCode: string
  codigo: string
  descricao?: string
  categoria: string
}): Promise<FechamentoState> {
  try {
    const { admin } = await requireModulePermission("financeiro", "edit")
    const codigo = input.codigo?.trim()
    const categoria = input.categoria?.trim()
    if (!input.unitId || !codigo || !categoria)
      return { ok: false, message: "Dados inválidos." }

    // herda preço/considerar da categoria escolhida
    let preco = 0
    let considerar = true
    const lc = categoria.toLowerCase()
    if (lc === "não considerar" || lc === "nao considerar") {
      considerar = false
      preco = 0
    } else {
      const { data } = await admin
        .from("unit_produto_precos")
        .select("preco, considerar")
        .eq("unit_id", input.unitId)
        .eq("categoria", categoria)
        .gt("preco", 0)
        .limit(1)
        .maybeSingle()
      if (data) {
        preco = Number(data.preco) || 0
        considerar = !!data.considerar
      }
    }

    const { error } = await admin.from("unit_produto_precos").upsert(
      {
        unit_id: input.unitId,
        codigo,
        descricao: input.descricao ?? null,
        categoria,
        preco,
        considerar,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "unit_id,codigo" },
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
