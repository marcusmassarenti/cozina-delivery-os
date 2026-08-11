"use server"

import { revalidatePath } from "next/cache"

import { requireAdmin } from "@/lib/auth/guards"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  sincronizarCatalogo,
  type ResultadoCatalogo,
} from "@/lib/cardapioweb/catalogo"
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

export type CatalogoState = {
  ok: boolean
  message?: string
  resultado?: ResultadoCatalogo
}

/**
 * Puxa o cardápio inteiro da loja numa chamada só (a API não pagina) e grava
 * o snapshot. Rodar de novo é seguro: é upsert, e item que saiu do cardápio
 * é removido do snapshot.
 */
export async function rodarCatalogoAction(
  _prev: CatalogoState,
  formData: FormData,
): Promise<CatalogoState> {
  try {
    await requireAdmin()
  } catch {
    return { ok: false, message: "Só administradores podem sincronizar." }
  }

  const installId = String(formData.get("install_id") ?? "")
  if (!installId) return { ok: false, message: "Instalação não informada." }

  try {
    const resultado = await sincronizarCatalogo(installId)
    revalidatePath("/integracao/cardapioweb")
    return { ok: resultado.ok, message: resultado.erro, resultado }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Erro inesperado.",
    }
  }
}

export type VinculoState = {
  ok: boolean
  message?: string
  /** Quantos registros antigos passaram a pertencer à unidade. */
  reassociados?: { pedidos: number; catalogo: number; clientes: number }
}

/**
 * Aponta a loja do Cardápio Web para uma unidade — ou desvincula (unitId
 * vazio).
 *
 * Não basta gravar unit_id na instalação: pedido, cardápio e cliente já
 * importados guardam o próprio unit_id, copiado da instalação NA HORA em que
 * entraram. Quem conectou sem escolher a unidade tem esse histórico com o
 * campo em branco — e ele ficaria fora de qualquer visão por loja, sem
 * qualquer aviso. Por isso a troca reescreve o passado junto.
 */
export async function vincularUnidadeAction(
  _prev: VinculoState,
  formData: FormData,
): Promise<VinculoState> {
  try {
    await requireAdmin()
  } catch {
    return { ok: false, message: "Só administradores podem vincular a loja." }
  }

  const installId = String(formData.get("install_id") ?? "")
  const unitIdBruto = String(formData.get("unit_id") ?? "").trim()
  const unitId = unitIdBruto === "" ? null : unitIdBruto
  if (!installId) return { ok: false, message: "Instalação não informada." }

  const admin = createAdminClient()

  const { data: install } = await admin
    .from("cardapioweb_installs")
    .select("id, holding_id")
    .eq("id", installId)
    .maybeSingle()
  if (!install) return { ok: false, message: "Instalação não encontrada." }

  // A unidade precisa ser da MESMA holding da instalação. Sem esta checagem,
  // um id de outra empresa colado no form apontaria os pedidos para lá.
  if (unitId) {
    const { data: unidade } = await admin
      .from("units")
      .select("id, brands!inner(holding_id)")
      .eq("id", unitId)
      .maybeSingle()

    const holdingDaUnidade = (
      unidade as { brands?: { holding_id?: string } } | null
    )?.brands?.holding_id

    if (!unidade || holdingDaUnidade !== install.holding_id) {
      return { ok: false, message: "Essa unidade não é da sua empresa." }
    }
  }

  const { error } = await admin
    .from("cardapioweb_installs")
    .update({ unit_id: unitId, updated_at: new Date().toISOString() })
    .eq("id", installId)
  if (error) return { ok: false, message: error.message }

  // Alinha o histórico com o vínculo novo.
  const reassociados = { pedidos: 0, catalogo: 0, clientes: 0 }
  const tabelas: [string, keyof typeof reassociados][] = [
    ["cardapioweb_pedidos", "pedidos"],
    ["cardapioweb_catalogo_itens", "catalogo"],
    ["cardapioweb_clientes", "clientes"],
  ]
  for (const [tabela, chave] of tabelas) {
    const { data } = await admin
      .from(tabela)
      .update({ unit_id: unitId })
      .eq("install_id", installId)
      .select("id")
    reassociados[chave] = (data ?? []).length
  }

  // Marca o canal na unidade, pra ela aparecer com o selo do Cardápio Web na
  // listagem sem ninguém precisar lembrar de ir lá marcar na mão.
  if (unitId) {
    await admin
      .from("unit_platforms")
      .upsert(
        { unit_id: unitId, platform: "cardapioweb", active: true },
        { onConflict: "unit_id,platform" },
      )
  }

  // Mesmo aviso do iFood: vincular é conectar, e o cliente merece saber com
  // os números na mão. `soSeCompleto` segura enquanto não há dado — o e-mail
  // sai uma vez só por (loja, plataforma) e mandá-lo vazio queima a chance.
  //
  // Só no VÍNCULO, nunca no desvínculo: unitId vazio é a pessoa desfazendo, e
  // "sua loja foi conectada" ali seria o oposto do que aconteceu.
  if (unitId) {
    try {
      const { avisarConexaoAtivada } = await import(
        "@/lib/email/conexao-ativada"
      )
      await avisarConexaoAtivada(unitId, "cardapioweb", { soSeCompleto: true })
    } catch (e) {
      console.error("[cardapioweb] aviso de conexão:", e)
    }
  }

  revalidatePath("/integracao/cardapioweb")
  revalidatePath("/unidades")
  return { ok: true, reassociados }
}
