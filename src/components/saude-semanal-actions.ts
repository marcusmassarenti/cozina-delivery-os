"use server"

import { requireAuth } from "@/lib/auth/guards"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Marca a semana do aviso de saúde como vista pelo usuário logado.
 *
 * No banco (profiles.saude_aviso_semana), não no localStorage — mesma razão do
 * changelog: localStorage é por navegador, então o aviso voltaria no celular
 * depois de fechado no desktop.
 */
export async function marcarAvisoSaudeVisto(semana: string): Promise<void> {
  if (!semana) return
  const { userId } = await requireAuth()
  await createAdminClient()
    .from("profiles")
    .update({ saude_aviso_semana: semana })
    .eq("user_id", userId)
}
