import "server-only"

import { cache } from "react"

import { getCurrentHoldingId, isSuperadmin } from "@/lib/auth/permissions"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Quem enxerga o painel da Carteira.
 *
 * DUAS condições, e as duas são de propósito:
 *  1. o cliente foi liberado um a um pelo super-admin (`carteira_habilitada`);
 *  2. ele é do tipo Consultoria.
 *
 * A segunda parece redundante — a action de liberar já exige Consultoria —
 * mas ela cobre o caminho que ninguém lembra: o cliente é liberado, e meses
 * depois alguém edita o cadastro e troca o tipo pra "Restaurante". Sem a
 * checagem aqui o painel continuaria aberto pra quem deixou de se
 * enquadrar, e ninguém revisita liberações antigas.
 *
 * `cache` do React: a mesma resposta serve o layout que barra a rota e o
 * menu que decide mostrar os itens, no mesmo request.
 */
export const podeVerCarteira = cache(async (): Promise<boolean> => {
  // Super-admin sempre vê — é quem constrói e dá suporte.
  if (await isSuperadmin()) return true
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return false

  const { data } = await createAdminClient()
    .from("holdings")
    .select("carteira_habilitada, establishment_type")
    .eq("id", holdingId)
    .maybeSingle()
  if (!data?.carteira_habilitada) return false
  return ehConsultoria(data.establishment_type as string | null)
})

/** Aceita as grafias antigas que o `normalizaTipoCliente` já mapeia. */
export function ehConsultoria(tipo: string | null): boolean {
  return (tipo ?? "").trim().toLowerCase() === "consultoria"
}
