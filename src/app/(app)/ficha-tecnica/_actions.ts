"use server"

/**
 * Salvar o custo de um item vendido.
 *
 * Uma ação por linha, sem botão de "salvar tudo": quem preenche cem linhas não
 * pode perder o trabalho porque fechou a aba antes de apertar salvar. Cada
 * campo grava sozinho ao sair dele.
 */
import { revalidatePath } from "next/cache"

import { getAuthUser } from "@/lib/auth/permissions"
import { requireAdmin } from "@/lib/auth/guards"
import { createAdminClient } from "@/lib/supabase/admin"
import { getVisibleUnits } from "@/lib/data/units"
import { PLATAFORMAS_CUSTO } from "@/lib/data/custo-itens"

export type EstadoCusto = { ok: boolean; erro?: string }

/**
 * A loja tem que estar no escopo de quem está salvando.
 *
 * ⚠️ O unitId chega do navegador. Sem esta checagem, um administrador de outro
 * cliente gravaria custo na loja do vizinho mandando o uuid na mão — a tela
 * nunca ofereceria a opção, mas a ação aceitaria.
 */
async function lojaPermitida(unitId: string): Promise<boolean> {
  const units = await getVisibleUnits()
  return units.some((u) => u.id === unitId)
}

export async function salvarCustoItem(input: {
  unitId: string
  platform: string
  nomeItem: string
  /** Null apaga a linha — é como se volta pra "não preenchido". */
  custo: number | null
}): Promise<EstadoCusto> {
  try {
    await requireAdmin()
  } catch {
    return { ok: false, erro: "Sem permissão." }
  }

  if (!(await lojaPermitida(input.unitId))) {
    return { ok: false, erro: "Loja fora do seu acesso." }
  }
  if (!PLATAFORMAS_CUSTO.includes(input.platform as never)) {
    return { ok: false, erro: "Plataforma inválida." }
  }
  const nome = input.nomeItem.trim()
  if (!nome) return { ok: false, erro: "Item sem nome." }

  const admin = createAdminClient()

  // Campo apagado = some a linha. Zero continua sendo um custo válido (item de
  // cortesia), então não dá pra usar zero como "vazio".
  if (input.custo === null) {
    const { error } = await admin
      .from("item_custos")
      .delete()
      .eq("unit_id", input.unitId)
      .eq("platform", input.platform)
      .eq("nome_item", nome)
    if (error) return { ok: false, erro: error.message }
    revalidatePath("/ficha-tecnica")
    return { ok: true }
  }

  if (!Number.isFinite(input.custo) || input.custo < 0) {
    return { ok: false, erro: "Custo inválido." }
  }

  const user = await getAuthUser()
  const { error } = await admin.from("item_custos").upsert(
    {
      unit_id: input.unitId,
      platform: input.platform,
      nome_item: nome,
      custo: input.custo,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "unit_id,platform,nome_item" },
  )
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/ficha-tecnica")
  return { ok: true }
}

/**
 * Copia o custo de uma linha para as outras que parecem ser a mesma comida.
 *
 * ⚠️ NÃO É AUTOMÁTICO, e é por isso que ele existe como botão. Medimos que
 * casar nome entre plataformas acerta pouco (127 nomes numa loja viram 115
 * depois de normalizar tudo): um vínculo automático erraria em silêncio. Aqui a
 * pessoa vê a lista do que vai receber o custo e confirma — a mesma sobrecoxa
 * escrita de três jeitos resolve num clique, e o erro, se houver, é visível.
 */
export async function aplicarCustoEmLote(input: {
  unitId: string
  custo: number
  alvos: { platform: string; nomeItem: string }[]
}): Promise<EstadoCusto & { gravados?: number }> {
  try {
    await requireAdmin()
  } catch {
    return { ok: false, erro: "Sem permissão." }
  }
  if (!(await lojaPermitida(input.unitId))) {
    return { ok: false, erro: "Loja fora do seu acesso." }
  }
  if (!Number.isFinite(input.custo) || input.custo < 0) {
    return { ok: false, erro: "Custo inválido." }
  }

  const validos = input.alvos.filter(
    (a) =>
      PLATAFORMAS_CUSTO.includes(a.platform as never) && a.nomeItem.trim() !== "",
  )
  if (validos.length === 0) return { ok: true, gravados: 0 }

  const user = await getAuthUser()
  const agora = new Date().toISOString()
  const { error } = await createAdminClient()
    .from("item_custos")
    .upsert(
      validos.map((a) => ({
        unit_id: input.unitId,
        platform: a.platform,
        nome_item: a.nomeItem.trim(),
        custo: input.custo,
        updated_by: user?.id ?? null,
        updated_at: agora,
      })),
      { onConflict: "unit_id,platform,nome_item" },
    )
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/ficha-tecnica")
  return { ok: true, gravados: validos.length }
}
