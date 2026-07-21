"use server"

import { revalidatePath } from "next/cache"

import { requireAdmin } from "@/lib/auth/guards"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  sincronizarClientes,
  type ResultadoClientes,
} from "@/lib/cardapioweb/clientes"
import type { CwInstall } from "@/lib/cardapioweb/pedidos"
import { sincronizarInstall, type ResultadoSync } from "@/lib/cardapioweb/sync"
import type { CwAmbiente, CwAuthMode } from "@/lib/cardapioweb/auth"

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

export type ClientesState = {
  ok: boolean
  message?: string
  resultado?: ResultadoClientes
}

/**
 * Avança a varredura de clientes. Separado do sync de pedidos porque a
 * listagem não tem filtro por data: é sempre varredura do começo, e numa
 * base grande isso é caro demais pra rodar junto a cada clique.
 */
export async function sincronizarClientesAction(
  _prev: ClientesState,
  formData: FormData,
): Promise<ClientesState> {
  try {
    await requireAdmin()
  } catch {
    return { ok: false, message: "Só administradores podem sincronizar." }
  }

  const installId = String(formData.get("install_id") ?? "")
  if (!installId) return { ok: false, message: "Instalação não informada." }

  const admin = createAdminClient()
  const { data } = await admin
    .from("cardapioweb_installs")
    .select("id, ambiente, auth_mode, unit_id, active")
    .eq("id", installId)
    .maybeSingle()

  if (!data) return { ok: false, message: "Instalação não encontrada." }
  if (!data.active) {
    return { ok: false, message: "Instalação inativa — reconectar a loja." }
  }

  const install: CwInstall = {
    id: data.id as string,
    ambiente: data.ambiente as CwAmbiente,
    authMode: data.auth_mode as CwAuthMode,
    unitId: (data.unit_id as string | null) ?? null,
  }

  try {
    const resultado = await sincronizarClientes(install)
    revalidatePath("/integracao/cardapioweb")
    return { ok: !resultado.erro, message: resultado.erro, resultado }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Falha ao buscar clientes.",
    }
  }
}
