"use server"

import { revalidatePath } from "next/cache"

import { requireAdmin } from "@/lib/auth/guards"
import { sincronizarInstall, type ResultadoSync } from "@/lib/cardapioweb/sync"

export type SyncState = {
  ok: boolean
  message?: string
  resultado?: ResultadoSync
}

/**
 * Roda uma fatia do sync de uma loja. Cada clique avança um pedaço
 * (incremental + 30 dias de backfill + 80 detalhes) — é assim que o job é
 * retomável sem estourar o tempo da function.
 */
export async function rodarSyncAction(
  _prev: SyncState,
  formData: FormData,
): Promise<SyncState> {
  try {
    await requireAdmin()
  } catch {
    return { ok: false, message: "Só administradores podem sincronizar." }
  }

  const installId = String(formData.get("install_id") ?? "")
  if (!installId) return { ok: false, message: "Instalação não informada." }

  try {
    const resultado = await sincronizarInstall(installId)
    revalidatePath("/integracao/cardapioweb")
    return {
      ok: !resultado.erro,
      message: resultado.erro,
      resultado,
    }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Falha no sync.",
    }
  }
}
