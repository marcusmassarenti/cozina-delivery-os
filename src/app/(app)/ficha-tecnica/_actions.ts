"use server"

import { revalidatePath } from "next/cache"

import { requireAdmin } from "@/lib/auth/guards"

export type ActionState = { ok: boolean; message?: string }

type Platform = "ifood" | "99food" | "keeta"

function fail(message: string): ActionState {
  return { ok: false, message }
}

/**
 * Importa/atualiza o catálogo de insumos do ERP a partir de texto colado
 * (uma linha por insumo). Aceita colunas separadas por TAB (Código / Nome /
 * Unidade) ou "CÓDIGO Nome".
 */
export async function importInsumos(text: string): Promise<ActionState> {
  let admin
  try {
    ;({ admin } = await requireAdmin())
  } catch {
    return fail("Apenas administradores.")
  }
  const rows: { codigo: string; nome: string; unidade: string; ativo: boolean }[] =
    []
  for (const raw of (text ?? "").split("\n")) {
    const line = raw.trim()
    if (!line) continue
    let codigo: string
    let nome: string
    let unidade = "UN"
    if (line.includes("\t")) {
      const p = line.split("\t").map((s) => s.trim())
      codigo = p[0]
      nome = p[1] || p[0]
      if (p[2]) unidade = p[2]
    } else {
      const m = line.match(/^(\S+)\s+(.*)$/)
      if (m) {
        codigo = m[1]
        nome = m[2]
      } else {
        codigo = line
        nome = line
      }
    }
    if (!codigo) continue
    rows.push({ codigo: codigo.toUpperCase(), nome, unidade, ativo: true })
  }
  if (rows.length === 0) return fail("Nada pra importar.")

  const { error } = await admin
    .from("producao_insumo")
    .upsert(rows, { onConflict: "codigo" })
  if (error) return fail(`Erro ao salvar: ${error.message}`)
  revalidatePath("/ficha-tecnica")
  return { ok: true, message: `${rows.length} insumo(s) salvos.` }
}

/** Adiciona/atualiza insumos do catálogo a partir de linhas estruturadas
 * (form de campos + importação de planilha .xlsx). */
export async function upsertInsumosRows(
  rows: { codigo: string; nome: string; unidade?: string }[],
): Promise<ActionState> {
  let admin
  try {
    ;({ admin } = await requireAdmin())
  } catch {
    return fail("Apenas administradores.")
  }
  const clean = (rows ?? [])
    .map((r) => ({
      codigo: (r.codigo ?? "").trim().toUpperCase(),
      nome: (r.nome ?? "").trim(),
      unidade: (r.unidade ?? "").trim() || "UN",
      ativo: true,
    }))
    .filter((r) => r.codigo && r.nome)
  if (clean.length === 0) return fail("Preencha pelo menos Código e Nome.")
  const { error } = await admin
    .from("producao_insumo")
    .upsert(clean, { onConflict: "codigo" })
  if (error) return fail(`Erro ao salvar: ${error.message}`)
  revalidatePath("/ficha-tecnica")
  return { ok: true, message: `${clean.length} insumo(s) salvos.` }
}

/**
 * Define a ficha de UM item vendido (1 etapa: item → insumos). Por trás cria/
 * acha o "prato" interno (nome = nome do item) e o de-para, e grava a ficha.
 * Códigos repetidos somam; fora do catálogo são ignorados e reportados.
 */
export async function setItemFicha(input: {
  platform: Platform
  nomeItem: string
  linhas: { codigo: string; qtd: number }[]
}): Promise<ActionState> {
  let admin
  try {
    ;({ admin } = await requireAdmin())
  } catch {
    return fail("Apenas administradores.")
  }
  if (!input.nomeItem) return fail("Item inválido.")

  // Normaliza + soma repetidos.
  const merged = new Map<string, number>()
  for (const l of input.linhas ?? []) {
    const codigo = (l.codigo ?? "").trim().toUpperCase()
    const qtd = Number(l.qtd) || 0
    if (!codigo || qtd <= 0) continue
    merged.set(codigo, (merged.get(codigo) ?? 0) + qtd)
  }

  // Acha (ou cria) o prato interno desse item.
  const { data: existing } = await admin
    .from("producao_prato_nome")
    .select("prato_id")
    .eq("platform", input.platform)
    .eq("nome_item", input.nomeItem)
    .maybeSingle()
  let pratoId = existing?.prato_id as string | undefined
  if (!pratoId) {
    if (merged.size === 0) return { ok: true }
    const { data: created, error: e1 } = await admin
      .from("producao_prato")
      .insert({ nome: input.nomeItem })
      .select("id")
      .single()
    if (e1 || !created) return fail(`Erro ao criar: ${e1?.message ?? ""}`)
    pratoId = created.id
    const { error: e2 } = await admin.from("producao_prato_nome").insert({
      platform: input.platform,
      nome_item: input.nomeItem,
      prato_id: pratoId,
    })
    if (e2) return fail(`Erro ao mapear: ${e2.message}`)
  }
  const pid: string = pratoId!

  // Valida contra o catálogo.
  const { data: insumos } = await admin
    .from("producao_insumo")
    .select("codigo")
  const validos = new Set((insumos ?? []).map((i) => i.codigo as string))
  const aplicar: { codigo: string; qtd: number }[] = []
  const invalidos: string[] = []
  for (const [codigo, qtd] of merged) {
    if (validos.has(codigo)) aplicar.push({ codigo, qtd })
    else invalidos.push(codigo)
  }

  const { error: eDel } = await admin
    .from("producao_ficha")
    .delete()
    .eq("prato_id", pid)
  if (eDel) return fail(`Erro ao limpar ficha: ${eDel.message}`)
  if (aplicar.length > 0) {
    const { error: eIns } = await admin.from("producao_ficha").insert(
      aplicar.map((p) => ({
        prato_id: pid,
        insumo_codigo: p.codigo,
        qtd: p.qtd,
      })),
    )
    if (eIns) return fail(`Erro ao salvar ficha: ${eIns.message}`)
  }
  revalidatePath("/ficha-tecnica")
  return {
    ok: true,
    message:
      invalidos.length > 0
        ? `Salvo. Ignorados (fora do catálogo): ${invalidos.join(", ")}`
        : `Ficha salva (${aplicar.length} insumo(s)).`,
  }
}

/**
 * Aplica uma ficha (lista de insumos × qtd) em VÁRIOS itens de uma vez. Cada
 * destino pode ter a sua lista (ex.: mesma base, proteína trocada). Cria/acha o
 * prato interno de cada item, valida contra o catálogo e grava.
 */
export async function bulkSetFichas(
  targets: {
    platform: Platform
    nomeItem: string
    linhas: { codigo: string; qtd: number }[]
  }[],
): Promise<ActionState> {
  let admin
  try {
    ;({ admin } = await requireAdmin())
  } catch {
    return fail("Apenas administradores.")
  }
  if (!targets || targets.length === 0) {
    return fail("Nenhum produto selecionado.")
  }
  const { data: insumos } = await admin
    .from("producao_insumo")
    .select("codigo")
  const validos = new Set((insumos ?? []).map((i) => i.codigo as string))

  let okCount = 0
  for (const t of targets) {
    if (!t.nomeItem) continue
    const merged = new Map<string, number>()
    for (const l of t.linhas ?? []) {
      const codigo = (l.codigo ?? "").trim().toUpperCase()
      const qtd = Number(l.qtd) || 0
      if (!codigo || qtd <= 0 || !validos.has(codigo)) continue
      merged.set(codigo, (merged.get(codigo) ?? 0) + qtd)
    }
    if (merged.size === 0) continue

    const { data: existing } = await admin
      .from("producao_prato_nome")
      .select("prato_id")
      .eq("platform", t.platform)
      .eq("nome_item", t.nomeItem)
      .maybeSingle()
    let pratoId = existing?.prato_id as string | undefined
    if (!pratoId) {
      const { data: created } = await admin
        .from("producao_prato")
        .insert({ nome: t.nomeItem })
        .select("id")
        .single()
      if (!created) continue
      pratoId = created.id
      await admin.from("producao_prato_nome").insert({
        platform: t.platform,
        nome_item: t.nomeItem,
        prato_id: pratoId,
      })
    }
    const pid: string = pratoId!
    await admin.from("producao_ficha").delete().eq("prato_id", pid)
    await admin.from("producao_ficha").insert(
      Array.from(merged.entries()).map(([codigo, qtd]) => ({
        prato_id: pid,
        insumo_codigo: codigo,
        qtd,
      })),
    )
    okCount++
  }
  revalidatePath("/ficha-tecnica")
  return { ok: true, message: `Ficha aplicada em ${okCount} produto(s).` }
}

/** Remove a ficha/mapeamento de um item (volta a "sem ficha"). Limpa o prato
 * interno se ele não tiver mais nenhum nome apontando. */
export async function removeItemFicha(input: {
  platform: Platform
  nomeItem: string
}): Promise<ActionState> {
  let admin
  try {
    ;({ admin } = await requireAdmin())
  } catch {
    return fail("Apenas administradores.")
  }
  const { data: map } = await admin
    .from("producao_prato_nome")
    .select("prato_id")
    .eq("platform", input.platform)
    .eq("nome_item", input.nomeItem)
    .maybeSingle()
  await admin
    .from("producao_prato_nome")
    .delete()
    .eq("platform", input.platform)
    .eq("nome_item", input.nomeItem)
  if (map?.prato_id) {
    const { count } = await admin
      .from("producao_prato_nome")
      .select("id", { count: "exact", head: true })
      .eq("prato_id", map.prato_id)
    if (!count) {
      await admin.from("producao_prato").delete().eq("id", map.prato_id)
    }
  }
  revalidatePath("/ficha-tecnica")
  return { ok: true }
}
