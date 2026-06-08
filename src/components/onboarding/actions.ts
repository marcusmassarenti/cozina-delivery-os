"use server"

import { requireAuth } from "@/lib/auth/guards"
import { createAdminClient } from "@/lib/supabase/admin"

/** Marca o usuário logado como já tendo visto o tour de boas-vindas. */
export async function markOnboarded(): Promise<void> {
  const { userId } = await requireAuth()
  const admin = createAdminClient()
  await admin.from("profiles").update({ onboarded: true }).eq("user_id", userId)
}
