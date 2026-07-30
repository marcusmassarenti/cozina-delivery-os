"use server"

import { revalidatePath, revalidateTag } from "next/cache"

import { requireUnitAccess } from "@/lib/auth/guards"

export type SaveCostsState = {
  ok: boolean
  message?: string
}

/**
 * Salva (upsert parcial) os custos manuais de UMA unidade no mês, direto da
 * tabela do Resultado:
 *  - custo_produtos_cozina (CMV que veio da fábrica Cozina)
 *  - custo_operacao        (aluguel, folha, etc. — opcional)
 *
 * Só toca nessas duas colunas; o restante da linha mensal (VR, nota, etc.)
 * fica intacto graças ao onConflict. Service role + requireAuth (segue o
 * mesmo padrão das outras actions de lançamento).
 */
export async function saveUnitCosts(input: {
  unitId: string
  year: number
  month: number
  custoCozina: number
  custoOperacao: number
}): Promise<SaveCostsState> {
  const { unitId, year, month } = input
  if (!unitId || !year || !month) {
    return { ok: false, message: "Dados inválidos." }
  }
  const custoCozina = Number.isFinite(input.custoCozina)
    ? Math.max(0, input.custoCozina)
    : 0
  const custoOperacao = Number.isFinite(input.custoOperacao)
    ? Math.max(0, input.custoOperacao)
    : 0

  try {
    // Escopo por UNIDADE (não financeiro:edit global): o franqueado gerencia o
    // custo da própria loja; admin/holding gerencia qualquer uma. Também fecha
    // o buraco cross-tenant (antes não checava a unidade).
    const { admin: supabase } = await requireUnitAccess(unitId)
    const { error } = await supabase.from("monthly_entries").upsert(
      {
        unit_id: unitId,
        year,
        month,
        custo_produtos_cozina: custoCozina,
        custo_operacao: custoOperacao,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "unit_id,year,month" },
    )
    if (error) return { ok: false, message: error.message }

    revalidateTag("reports", "max")
    revalidatePath("/financeiro")
    revalidatePath("/unidades/[codigo]", "page")
    revalidatePath("/inicio")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro desconhecido",
    }
  }
}

/* ───────────── Custos por CATEGORIA (por unidade / mês) ───────────── */

type Admin = Awaited<ReturnType<typeof requireUnitAccess>>["admin"]
type CostTipo = "cmv" | "operacao"

/**
 * Recalcula a soma das categorias do mês e grava nos campos que o DRE usa:
 *   cmv → custo_produtos_loja   |   operacao → custo_operacao.
 * Só sobrescreve o campo se existir categoria daquele tipo (senão preserva o
 * valor único legado da loja que ainda não migrou pra categorias).
 */
async function syncMonthlyCosts(
  admin: Admin,
  unitId: string,
  year: number,
  month: number,
  /** Tipos a gravar mesmo se caírem a 0 (ex.: após remover a última categoria
   * do tipo — senão o total antigo ficaria órfão no DRE). */
  force?: Set<CostTipo>,
) {
  const { data: cats } = await admin
    .from("unit_cost_categories")
    .select("id, tipo")
    .eq("unit_id", unitId)
    .eq("arquivada", false)
  const catList = cats ?? []
  const cmvIds = new Set(catList.filter((c) => c.tipo === "cmv").map((c) => c.id))
  const opIds = new Set(
    catList.filter((c) => c.tipo === "operacao").map((c) => c.id),
  )

  let cmvSum = 0
  let opSum = 0
  if (catList.length) {
    const { data: vals } = await admin
      .from("unit_cost_values")
      .select("category_id, valor")
      .in(
        "category_id",
        catList.map((c) => c.id),
      )
      .eq("ano", year)
      .eq("mes", month)
    for (const v of vals ?? []) {
      const val = Number(v.valor)
      if (cmvIds.has(v.category_id)) cmvSum += val
      else if (opIds.has(v.category_id)) opSum += val
    }
  }

  const patch: Record<string, unknown> = {
    unit_id: unitId,
    year,
    month,
    updated_at: new Date().toISOString(),
  }
  if (cmvIds.size > 0 || force?.has("cmv"))
    patch.custo_produtos_cozina = cmvSum
  if (opIds.size > 0 || force?.has("operacao")) patch.custo_operacao = opSum
  await admin
    .from("monthly_entries")
    .upsert(patch, { onConflict: "unit_id,year,month" })
}

function revalidateCosts() {
  revalidateTag("reports", "max")
  revalidatePath("/financeiro")
  revalidatePath("/unidades/[codigo]", "page")
  revalidatePath("/inicio")
}

/** Cria uma categoria de custo na unidade. Se for a 1ª do tipo, move o valor
 * único legado do mês pra ela (não perde dado). */
export async function addCostCategory(input: {
  unitId: string
  nome: string
  tipo: CostTipo
  year: number
  month: number
}): Promise<{ ok: boolean; message?: string; id?: string }> {
  const nome = input.nome.trim()
  if (!nome) return { ok: false, message: "Dê um nome à categoria." }
  if (input.tipo !== "cmv" && input.tipo !== "operacao")
    return { ok: false, message: "Tipo inválido." }
  try {
    const { admin } = await requireUnitAccess(input.unitId)
    const { data: existing } = await admin
      .from("unit_cost_categories")
      .select("id")
      .eq("unit_id", input.unitId)
      .eq("tipo", input.tipo)
      .eq("arquivada", false)
    const isFirst = (existing ?? []).length === 0
    const { data: cat, error } = await admin
      .from("unit_cost_categories")
      .insert({
        unit_id: input.unitId,
        nome,
        tipo: input.tipo,
        sort: existing?.length ?? 0,
      })
      .select("id")
      .single()
    if (error || !cat) return { ok: false, message: error?.message ?? "Falha ao criar." }

    if (isFirst) {
      const { data: me } = await admin
        .from("monthly_entries")
        .select("custo_produtos_cozina, custo_operacao")
        .eq("unit_id", input.unitId)
        .eq("year", input.year)
        .eq("month", input.month)
        .maybeSingle()
      const legacy =
        input.tipo === "cmv"
          ? Number(me?.custo_produtos_cozina ?? 0)
          : Number(me?.custo_operacao ?? 0)
      if (legacy > 0) {
        await admin.from("unit_cost_values").upsert(
          {
            category_id: cat.id,
            unit_id: input.unitId,
            ano: input.year,
            mes: input.month,
            valor: legacy,
          },
          { onConflict: "category_id,ano,mes" },
        )
      }
    }

    await syncMonthlyCosts(admin, input.unitId, input.year, input.month)
    revalidateCosts()
    return { ok: true, id: cat.id as string }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Erro." }
  }
}

/** Renomeia uma categoria. */
export async function renameCostCategory(input: {
  unitId: string
  categoryId: string
  nome: string
}): Promise<{ ok: boolean; message?: string }> {
  const nome = input.nome.trim()
  if (!nome) return { ok: false, message: "Nome vazio." }
  try {
    const { admin } = await requireUnitAccess(input.unitId)
    const { error } = await admin
      .from("unit_cost_categories")
      .update({ nome })
      .eq("id", input.categoryId)
      .eq("unit_id", input.unitId)
    if (error) return { ok: false, message: error.message }
    revalidateCosts()
    return { ok: true }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Erro." }
  }
}

/** Remove uma categoria (e seus valores) e recalcula o total do mês. */
export async function deleteCostCategory(input: {
  unitId: string
  categoryId: string
  year: number
  month: number
}): Promise<{ ok: boolean; message?: string }> {
  try {
    const { admin } = await requireUnitAccess(input.unitId)
    // Descobre o tipo antes de remover pra forçar o recálculo desse campo (pode
    // cair a 0 se era a última categoria do tipo).
    const { data: cat } = await admin
      .from("unit_cost_categories")
      .select("tipo")
      .eq("id", input.categoryId)
      .eq("unit_id", input.unitId)
      .maybeSingle()
    const { error } = await admin
      .from("unit_cost_categories")
      .delete()
      .eq("id", input.categoryId)
      .eq("unit_id", input.unitId)
    if (error) return { ok: false, message: error.message }
    const force = cat?.tipo
      ? new Set<CostTipo>([cat.tipo as CostTipo])
      : undefined
    await syncMonthlyCosts(admin, input.unitId, input.year, input.month, force)
    revalidateCosts()
    return { ok: true }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Erro." }
  }
}

/** Salva o valor de uma categoria no mês e recalcula o total. */
export async function saveCostValue(input: {
  unitId: string
  categoryId: string
  year: number
  month: number
  valor: number
}): Promise<{ ok: boolean; message?: string }> {
  const valor = Number.isFinite(input.valor) ? Math.max(0, input.valor) : 0
  try {
    const { admin } = await requireUnitAccess(input.unitId)
    const { error } = await admin.from("unit_cost_values").upsert(
      {
        category_id: input.categoryId,
        unit_id: input.unitId,
        ano: input.year,
        mes: input.month,
        valor,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "category_id,ano,mes" },
    )
    if (error) return { ok: false, message: error.message }
    await syncMonthlyCosts(admin, input.unitId, input.year, input.month)
    revalidateCosts()
    return { ok: true }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Erro." }
  }
}
