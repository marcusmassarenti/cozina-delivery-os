"use server"

import { randomBytes } from "node:crypto"

import { revalidatePath } from "next/cache"

import { requireAdmin } from "@/lib/auth/guards"
import { getAccessibleUnitIds, isSuperadmin } from "@/lib/auth/permissions"
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
  // os números na mão — mas com o histórico FECHADO, não no meio da carga. O
  // Cardápio Web traz o ano em janelas de 30 dias, então quem acabou de
  // instalar só recebe daqui a algumas noites, pelo cron. A chamada fica pra
  // quem revincula uma instalação cujo histórico já está completo.
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

export type ConviteState = {
  ok: boolean
  url?: string
  expiraEm?: string
  message?: string
}

/**
 * Gera o link que o DONO DA LOJA abre pra autorizar, sem ter conta aqui.
 *
 * ── POR QUE (Marcus, 27/08/26) ───────────────────────────────────────────
 * "ele não tem acesso ao deliveryOS. quem tem é o usuário adenilton e o dono da
 * loja é outra pessoa que não usa nosso sistema."
 *
 * O botão "Conectar no Cardápio Web" exige sessão de admin, então só serve
 * quando quem opera o painel é também o proprietário da loja — o que quase
 * nunca é o caso de quem tem assessoria.
 *
 * 7 DIAS de validade. O `state` do OAuth continua com 10 minutos (é o padrão do
 * protocolo e ele nasce no clique do dono, não aqui); o que dura uma semana é o
 * CONVITE. Sem isso, admin e dono precisariam estar combinados ao vivo.
 */
export async function gerarConviteAction(
  unitId: string,
  ambiente: CwAmbiente = "producao",
): Promise<ConviteState> {
  try {
    await requireAdmin()
  } catch {
    return { ok: false, message: "Só administradores podem gerar o convite." }
  }
  if (!unitId) return { ok: false, message: "Escolha a loja." }

  /**
   * ⚠️ QUEM PEDE PRECISA TER ACESSO À LOJA — menos o dono da plataforma.
   *
   * A primeira versão derivava a empresa da LOJA (certo, evita apontar pra
   * empresa errada) mas NÃO conferia se quem pediu enxerga aquela loja. Com o
   * uuid de uma unidade de outro cliente, um admin qualquer geraria convite pra
   * loja alheia. O estrago seria pequeno — o token só amarra instalação, e a
   * autorização ainda exige o Proprietário do lado do Cardápio Web — mas é
   * furo de isolamento entre clientes, que neste projeto já voltou duas vezes.
   *
   * O superadmin passa de propósito: é a tela dele em /clientes que precisa
   * gerar convite pra qualquer cliente (Marcus, 27/08/26: "eu como dono do
   * sistema preciso na minha tela poder gerar para outros clientes").
   */
  if (!(await isSuperadmin())) {
    const visiveis = await getAccessibleUnitIds()
    if (visiveis !== null && !visiveis.includes(unitId)) {
      return { ok: false, message: "Essa loja não é da sua empresa." }
    }
  }

  const admin = createAdminClient()

  // A empresa vem da LOJA, não do usuário: assim o convite não tem como
  // apontar pra uma empresa diferente da unidade escolhida.
  const { data: unit } = await admin
    .from("units")
    .select("id, brand_id")
    .eq("id", unitId)
    .maybeSingle()
  const brandId = (unit as { brand_id?: string } | null)?.brand_id
  if (!brandId) return { ok: false, message: "Loja não encontrada." }
  const { data: brand } = await admin
    .from("brands")
    .select("holding_id")
    .eq("id", brandId)
    .maybeSingle()
  const holdingId = (brand as { holding_id?: string } | null)?.holding_id
  if (!holdingId) return { ok: false, message: "Empresa da loja não encontrada." }

  const token = randomBytes(24).toString("base64url")
  const expira = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const { error } = await admin.from("cardapioweb_convites").insert({
    token,
    holding_id: holdingId,
    unit_id: unitId,
    ambiente,
    expira_em: expira.toISOString(),
  })
  if (error) return { ok: false, message: error.message }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.deliveryos.food"
  revalidatePath("/integracao/cardapioweb")
  return {
    ok: true,
    url: `${site}/conectar/cardapioweb/${token}`,
    expiraEm: expira.toISOString(),
  }
}
