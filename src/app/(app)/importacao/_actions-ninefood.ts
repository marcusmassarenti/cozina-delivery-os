"use server"

import { revalidatePath } from "next/cache"

import { assertCanView } from "@/lib/auth/permissions"
import {
  syncNinefoodFinanceiro,
  type ShopSyncResult,
} from "@/lib/ninefood/sync-financeiro"
import {
  syncNinefoodCardapio,
  type CardapioSyncResult,
} from "@/lib/ninefood/sync-cardapio"

export type Ninefood99SyncState = {
  ok: boolean
  message?: string
  competencia?: string
  results?: ShopSyncResult[]
}

/**
 * Puxa o financeiro do 99 (Bill Data) das lojas vinculadas pra a competência
 * informada e grava em ninefood_api_bill. Idempotente (upsert).
 */
export async function runNinefood99Sync(
  _prev: Ninefood99SyncState,
  formData: FormData,
): Promise<Ninefood99SyncState> {
  try {
    await assertCanView("importacao")
  } catch {
    return { ok: false, message: "Você não tem permissão para sincronizar." }
  }

  const competencia = String(formData.get("competencia") ?? "").trim() // "AAAA-MM"
  const m = competencia.match(/^(\d{4})-(\d{2})$/)
  if (!m) {
    return { ok: false, message: "Competência inválida — use o formato AAAA-MM." }
  }
  const year = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12) {
    return { ok: false, message: "Mês inválido na competência." }
  }
  const lastDay = new Date(year, month, 0).getDate() // último dia do mês
  const pad = (n: number) => String(n).padStart(2, "0")
  const startDate = `${m[1]}${m[2]}01`
  const endDate = `${m[1]}${m[2]}${pad(lastDay)}`

  try {
    const { results } = await syncNinefoodFinanceiro({ startDate, endDate })
    revalidatePath("/importacao")
    revalidatePath("/financeiro")
    revalidatePath("/")

    const comErro = results.filter((r) => r.error)
    return {
      ok: comErro.length === 0,
      competencia,
      results,
      message: comErro.length
        ? `${comErro.length} loja(s) com erro — veja abaixo.`
        : undefined,
    }
  } catch (e) {
    return {
      ok: false,
      competencia,
      message: e instanceof Error ? e.message : "Erro inesperado no sync.",
    }
  }
}

export type Ninefood99CardapioState = {
  ok: boolean
  message?: string
  results?: CardapioSyncResult[]
}

/**
 * Puxa o cardápio atual (snapshot) das lojas vinculadas do 99 e grava em
 * ninefood_api_menu_item.
 */
export async function runNinefood99Cardapio(
  _prev: Ninefood99CardapioState,
  _formData: FormData,
): Promise<Ninefood99CardapioState> {
  try {
    await assertCanView("importacao")
  } catch {
    return { ok: false, message: "Você não tem permissão para sincronizar." }
  }
  try {
    const { results } = await syncNinefoodCardapio()
    revalidatePath("/importacao")
    const comErro = results.filter((r) => r.error)
    return {
      ok: comErro.length === 0,
      results,
      message: comErro.length
        ? `${comErro.length} loja(s) com erro — veja abaixo.`
        : undefined,
    }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Erro inesperado no sync.",
    }
  }
}
