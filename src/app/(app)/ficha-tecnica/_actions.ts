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
 * Unidade) — ideal pra colar direto de uma planilha — ou "CÓDIGO Nome".
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

/**
 * Mapeia um item vendido (plataforma + nome) pra um prato canônico. Se o prato
 * (por nome) ainda não existe, cria. Upsert no de-para (1 nome por plataforma).
 */
export async function mapItem(input: {
  platform: Platform
  nomeItem: string
  pratoNome: string
}): Promise<ActionState> {
  let admin
  try {
    ;({ admin } = await requireAdmin())
  } catch {
    return fail("Apenas administradores.")
  }
  const pratoNome = input.pratoNome.trim()
  if (!input.nomeItem || !pratoNome) return fail("Informe o prato.")

  // Acha o prato por nome (case-insensitive) ou cria.
  const { data: existing } = await admin
    .from("producao_prato")
    .select("id")
    .ilike("nome", pratoNome)
    .maybeSingle()
  let pratoId = existing?.id as string | undefined
  if (!pratoId) {
    const { data: created, error: e1 } = await admin
      .from("producao_prato")
      .insert({ nome: pratoNome })
      .select("id")
      .single()
    if (e1 || !created) return fail(`Erro ao criar prato: ${e1?.message ?? ""}`)
    pratoId = created.id
  }

  const { error: e2 } = await admin.from("producao_prato_nome").upsert(
    {
      platform: input.platform,
      nome_item: input.nomeItem,
      prato_id: pratoId,
    },
    { onConflict: "platform,nome_item" },
  )
  if (e2) return fail(`Erro ao mapear: ${e2.message}`)
  revalidatePath("/ficha-tecnica")
  return { ok: true }
}

/** Remove o mapeamento de um item (volta a "não mapeado"). */
export async function unmapItem(input: {
  platform: Platform
  nomeItem: string
}): Promise<ActionState> {
  let admin
  try {
    ;({ admin } = await requireAdmin())
  } catch {
    return fail("Apenas administradores.")
  }
  const { error } = await admin
    .from("producao_prato_nome")
    .delete()
    .eq("platform", input.platform)
    .eq("nome_item", input.nomeItem)
  if (error) return fail(`Erro: ${error.message}`)
  revalidatePath("/ficha-tecnica")
  return { ok: true }
}

/** Adiciona/atualiza insumos do catálogo a partir de linhas estruturadas
 * (usado pelo form de campos e pela importação de planilha .xlsx). */
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
 * Substitui a ficha técnica de um prato por uma lista de { código, qtd }.
 * Códigos repetidos somam; códigos fora do catálogo são ignorados e
 * reportados.
 */
export async function setFicha(input: {
  pratoId: string
  linhas: { codigo: string; qtd: number }[]
}): Promise<ActionState> {
  let admin
  try {
    ;({ admin } = await requireAdmin())
  } catch {
    return fail("Apenas administradores.")
  }
  if (!input.pratoId) return fail("Prato inválido.")

  // Normaliza + soma repetidos.
  const merged = new Map<string, number>()
  for (const l of input.linhas ?? []) {
    const codigo = (l.codigo ?? "").trim().toUpperCase()
    const qtd = Number(l.qtd) || 0
    if (!codigo || qtd <= 0) continue
    merged.set(codigo, (merged.get(codigo) ?? 0) + qtd)
  }

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

  // Troca a ficha inteira do prato.
  const { error: eDel } = await admin
    .from("producao_ficha")
    .delete()
    .eq("prato_id", input.pratoId)
  if (eDel) return fail(`Erro ao limpar ficha: ${eDel.message}`)

  if (aplicar.length > 0) {
    const { error: eIns } = await admin.from("producao_ficha").insert(
      aplicar.map((p) => ({
        prato_id: input.pratoId,
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

/** Apaga um prato (e, em cascata, seus nomes e ficha). */
export async function deletePrato(pratoId: string): Promise<ActionState> {
  let admin
  try {
    ;({ admin } = await requireAdmin())
  } catch {
    return fail("Apenas administradores.")
  }
  const { error } = await admin
    .from("producao_prato")
    .delete()
    .eq("id", pratoId)
  if (error) return fail(`Erro: ${error.message}`)
  revalidatePath("/ficha-tecnica")
  return { ok: true }
}
