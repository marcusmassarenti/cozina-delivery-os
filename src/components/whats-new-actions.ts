"use server"

import { requireAuth } from "@/lib/auth/guards"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Marca a versão do changelog como vista pelo usuário logado.
 * Fica no BANCO (profiles.last_seen_version) e não no localStorage — assim o
 * aviso não volta em outro navegador/device nem se o browser limpar os dados.
 */
export async function markVersionSeen(version: string): Promise<void> {
  if (!version) return
  const { userId } = await requireAuth()
  const admin = createAdminClient()
  await admin
    .from("profiles")
    .update({ last_seen_version: version })
    .eq("user_id", userId)
}
