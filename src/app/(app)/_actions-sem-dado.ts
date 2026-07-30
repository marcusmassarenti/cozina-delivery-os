"use server"

import { revalidatePath } from "next/cache"

import { requireAdmin } from "@/lib/auth/guards"
import { getAccessibleUnitIds } from "@/lib/auth/permissions"

export type SemDadoState = { ok: boolean; message?: string }

/**
 * "Não vendo nessa plataforma" — desmarca a plataforma no cadastro da loja.
 *
 * É a saída do aviso de loja sem dado. Sem ela o aviso viraria cobrança
 * permanente pra quem não tem nada a fazer: loja que marcou Keeta por engano
 * ficaria sendo lembrada pra sempre de importar um relatório que não existe.
 *
 * Desmarcar não apaga nada: `active = false` só tira a plataforma das contas e
 * das cobranças de importação. Marcar de novo devolve tudo.
 */
export async function naoVendoNessaPlataforma(
  _prev: SemDadoState,
  formData: FormData,
): Promise<SemDadoState> {
  let admin: Awaited<ReturnType<typeof requireAdmin>>["admin"]
  try {
    admin = (await requireAdmin()).admin
  } catch {
    return { ok: false, message: "Só administradores podem alterar o cadastro." }
  }

  const unitId = String(formData.get("unit_id") ?? "").trim()
  const platform = String(formData.get("platform") ?? "").trim()
  if (!unitId || !["ifood", "99food", "keeta"].includes(platform)) {
    return { ok: false, message: "Dados incompletos." }
  }

  const acessiveis = await getAccessibleUnitIds()
  if (acessiveis !== null && !acessiveis.includes(unitId)) {
    return { ok: false, message: "Unidade inválida." }
  }

  const { error } = await admin
    .from("unit_platforms")
    .update({ active: false })
    .eq("unit_id", unitId)
    .eq("platform", platform)
  if (error) return { ok: false, message: `Falha: ${error.message}` }

  revalidatePath("/inicio")
  revalidatePath("/importacao")
  return { ok: true, message: "Pronto — a plataforma saiu do cadastro da loja." }
}
