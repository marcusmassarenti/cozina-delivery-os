import "server-only"

/**
 * As categorias padrão do cliente — a lista que toda loja sugere.
 *
 * ⚠️ NÃO É O VÍNCULO. A categoria de cada item continua em
 * `item_custos.categoria`; aqui vive só o vocabulário. Ver migration 0214: a
 * segunda loja começava com a lista vazia e quem preenchia escrevia "Bebida"
 * onde a primeira escreveu "Bebidas".
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"

export type CategoriaItem = { id: string; nome: string; ordem: number }

export async function getCategoriasPadrao(): Promise<CategoriaItem[]> {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return []

  const { data } = await createAdminClient()
    .from("item_categorias")
    .select("id, nome, ordem")
    .eq("holding_id", holdingId)
    .order("ordem")
    .order("nome")

  return (data ?? []) as CategoriaItem[]
}
