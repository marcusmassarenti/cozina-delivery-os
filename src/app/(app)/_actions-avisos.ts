"use server"

import { createClient } from "@/lib/supabase/server"

/**
 * Fecha um aviso para o usuário logado, pra valer e em todo aparelho.
 *
 * Sem `revalidatePath`: quem chama já esconde na hora (estado local). Um
 * refresh aqui faria a tela inteira recarregar por causa de um X.
 */
export async function fecharAviso(chave: string): Promise<{ ok: boolean }> {
  if (!chave || chave.length > 200) return { ok: false }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const { error } = await supabase
    .from("avisos_fechados")
    .upsert({ user_id: user.id, chave }, { onConflict: "user_id,chave" })
  if (error) {
    console.error("fecharAviso:", error.message)
    return { ok: false }
  }
  return { ok: true }
}
