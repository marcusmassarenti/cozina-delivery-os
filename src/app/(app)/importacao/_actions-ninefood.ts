"use server"

import { limparCacheAgregados } from "@/lib/cache-tags"

import { revalidatePath } from "next/cache"

import { assertCanView, getAccessibleUnitIds } from "@/lib/auth/permissions"
import { isApiSyncEnabled } from "@/lib/data/units"
import { createAdminClient } from "@/lib/supabase/admin"
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
 * Resolve QUAIS lojas 99 o usuário atual pode sincronizar.
 *
 * O sync manual é escopado ao tenant (mesma correção do iFood): sem isso,
 * qualquer clique sincronizava os links de TODOS os clientes e devolvia
 * nome das lojas alheias na resposta. O cron continua global — é nosso.
 *
 * Retorna null = sem restrição (admin de plataforma puro, sem empresa).
 * Retorna [] = a conta não tem nenhuma loja 99 vinculada → nada a fazer.
 */
async function appShopIdsDoUsuario(): Promise<string[] | null> {
  const unitIds = await getAccessibleUnitIds()
  if (unitIds === null) return null
  if (unitIds.length === 0) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from("ninefood_store_links")
    .select("app_shop_id")
    .eq("active", true)
    .in("unit_id", unitIds)
  return (data ?? []).map((r) => r.app_shop_id as string)
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

  if (!(await isApiSyncEnabled())) {
    return { ok: false, message: "Sync via API não habilitado para esta conta." }
  }
  const escopo = await appShopIdsDoUsuario()
  if (escopo !== null && escopo.length === 0) {
    return { ok: false, message: "Nenhuma loja 99 vinculada à sua conta." }
  }

  try {
    const { results } = await syncNinefoodFinanceiro({
      startDate,
      endDate,
      appShopIds: escopo ?? undefined,
    })
    revalidatePath("/importacao")
    revalidatePath("/financeiro")
    await limparCacheAgregados()
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

export type Ninefood99SyncAllState = {
  ok: boolean
  message?: string
  competencia?: string
  financeiro?: ShopSyncResult[]
  cardapio?: CardapioSyncResult[]
}

/**
 * Sincroniza TUDO do 99 de uma vez: financeiro (da competência) + cardápio
 * (snapshot). Aceita `competencia` (AAAA-MM) OU `year`+`month` (do Dashboard).
 */
export async function runNinefood99SyncAll(
  _prev: Ninefood99SyncAllState,
  formData: FormData,
): Promise<Ninefood99SyncAllState> {
  try {
    await assertCanView("importacao")
  } catch {
    return { ok: false, message: "Você não tem permissão para sincronizar." }
  }

  let year: number
  let month: number
  const comp = String(formData.get("competencia") ?? "").trim()
  const m = comp.match(/^(\d{4})-(\d{2})$/)
  if (m) {
    year = Number(m[1])
    month = Number(m[2])
  } else {
    year = Number(formData.get("year"))
    month = Number(formData.get("month"))
  }
  if (!year || !month || month < 1 || month > 12) {
    return { ok: false, message: "Competência inválida." }
  }
  const mm = String(month).padStart(2, "0")
  const lastDay = new Date(year, month, 0).getDate()
  const startDate = `${year}${mm}01`
  const endDate = `${year}${mm}${String(lastDay).padStart(2, "0")}`

  try {
    if (!(await isApiSyncEnabled())) {
      return {
        ok: false,
        message: "Sync via API não habilitado para esta conta.",
      }
    }
    const escopo = await appShopIdsDoUsuario()
    if (escopo !== null && escopo.length === 0) {
      return { ok: false, message: "Nenhuma loja 99 vinculada à sua conta." }
    }

    const fin = await syncNinefoodFinanceiro({
      startDate,
      endDate,
      appShopIds: escopo ?? undefined,
    })
    const card = await syncNinefoodCardapio({
      appShopIds: escopo ?? undefined,
    })

    // grava no histórico de importações com origem = 'api' (aparece junto dos
    // relatórios manuais, distinguível pela origem)
    const admin = createAdminClient()
    const unitByShop = new Map<string, string | null>()
    for (const r of fin.results) unitByShop.set(r.appShopId, r.unitId)
    const logs: Record<string, unknown>[] = []
    for (const r of fin.results) {
      if (r.unitId && r.count > 0)
        logs.push({
          unit_id: r.unitId,
          platform: "99food",
          report_type: "financeiro",
          cadencia: "mensal",
          ref_year: year,
          ref_month: month,
          rows_imported: r.count,
          status: r.error ? "error" : "success",
          error_message: r.error ?? null,
          source: "api",
        })
    }
    for (const r of card.results) {
      const uid = unitByShop.get(r.appShopId)
      if (uid && r.items > 0)
        logs.push({
          unit_id: uid,
          platform: "99food",
          report_type: "cardapio",
          cadencia: "mensal",
          ref_year: year,
          ref_month: month,
          rows_imported: r.items,
          status: r.error ? "error" : "success",
          error_message: r.error ?? null,
          source: "api",
        })
    }
    if (logs.length) await admin.from("platform_imports").insert(logs)

    revalidatePath("/importacao")
    revalidatePath("/financeiro")
    await limparCacheAgregados()
  revalidatePath("/")
    const erros = [
      ...fin.results.filter((r) => r.error),
      ...card.results.filter((r) => r.error),
    ]
    return {
      ok: erros.length === 0,
      competencia: `${year}-${mm}`,
      financeiro: fin.results,
      cardapio: card.results,
      message: erros.length ? `${erros.length} erro(s) — veja abaixo.` : undefined,
    }
  } catch (e) {
    return {
      ok: false,
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
  if (!(await isApiSyncEnabled())) {
    return { ok: false, message: "Sync via API não habilitado para esta conta." }
  }
  const escopo = await appShopIdsDoUsuario()
  if (escopo !== null && escopo.length === 0) {
    return { ok: false, message: "Nenhuma loja 99 vinculada à sua conta." }
  }
  try {
    const { results } = await syncNinefoodCardapio({
      appShopIds: escopo ?? undefined,
    })
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
