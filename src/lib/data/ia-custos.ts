/**
 * Consumo e CUSTO da IA (Nino AI) por cliente.
 *
 * A contagem de mensagens sempre existiu (`ia_chat_usage.chamadas`), mas o
 * custo depende dos TOKENS de cada resposta — que passaram a ser capturados
 * pelo cliente da Anthropic (`UsoIa`) e gravados aqui em `ia_chat_custos`.
 *
 * ⚠️ Não é retroativo: só vale das mensagens feitas depois da instrumentação.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { isSuperadmin } from "@/lib/auth/permissions"
import type { UsoIa } from "@/lib/anthropic/client"

/**
 * Preço por MILHÃO de tokens, em USD (tabela pública da Anthropic).
 * Cache: leitura custa 10% da entrada, escrita 125%.
 * Modelo desconhecido → custo 0 (melhor não inventar número).
 */
const PRECOS: Record<
  string,
  { entrada: number; saida: number; cacheLeitura: number; cacheEscrita: number }
> = {
  "claude-haiku-4-5": { entrada: 1, saida: 5, cacheLeitura: 0.1, cacheEscrita: 1.25 },
  "claude-sonnet-5": { entrada: 3, saida: 15, cacheLeitura: 0.3, cacheEscrita: 3.75 },
  "claude-sonnet-4-6": { entrada: 3, saida: 15, cacheLeitura: 0.3, cacheEscrita: 3.75 },
  "claude-opus-4-8": { entrada: 5, saida: 25, cacheLeitura: 0.5, cacheEscrita: 6.25 },
}
/** Busca na web (server tool): USD 10 por 1.000 buscas. */
const PRECO_BUSCA_WEB = 10 / 1000

/** Casa "claude-haiku-4-5-20251001" com a chave "claude-haiku-4-5". */
function precoDoModelo(modelo: string) {
  const chave = Object.keys(PRECOS).find((k) => modelo.startsWith(k))
  return chave ? PRECOS[chave] : null
}

/** Custo em USD de um consumo. Modelo desconhecido → 0 (e sinaliza). */
export function custoUsd(uso: UsoIa): { usd: number; conhecido: boolean } {
  const p = precoDoModelo(uso.modelo)
  if (!p) return { usd: 0, conhecido: false }
  const usd =
    (uso.inputTokens / 1_000_000) * p.entrada +
    (uso.outputTokens / 1_000_000) * p.saida +
    (uso.cacheReadTokens / 1_000_000) * p.cacheLeitura +
    (uso.cacheWriteTokens / 1_000_000) * p.cacheEscrita +
    uso.webSearches * PRECO_BUSCA_WEB
  return { usd, conhecido: true }
}

function mesCorrente(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

/**
 * Grava o consumo de UMA resposta. Nunca derruba a resposta ao usuário:
 * falha aqui só vira log (o dado de custo é telemetria, não o produto).
 */
export async function registrarUsoIa(
  holdingId: string | null,
  uso: UsoIa,
  origem: "nino" | "diagnostico" | "outro" = "nino",
): Promise<void> {
  if (!holdingId) return
  // Sem token nenhum = nada a cobrar (ex.: erro antes de gerar).
  if (uso.inputTokens === 0 && uso.outputTokens === 0) return
  try {
    const { usd } = custoUsd(uso)
    const admin = createAdminClient()
    await admin.from("ia_chat_custos").insert({
      holding_id: holdingId,
      mes: mesCorrente(),
      origem,
      modelo: uso.modelo,
      input_tokens: uso.inputTokens,
      output_tokens: uso.outputTokens,
      cache_read_tokens: uso.cacheReadTokens,
      cache_write_tokens: uso.cacheWriteTokens,
      web_searches: uso.webSearches,
      custo_usd: Number(usd.toFixed(6)),
    })
  } catch (e) {
    console.error("registrarUsoIa:", e instanceof Error ? e.message : e)
  }
}

/** Consumo de IA de UM cliente no mês (bloco no detalhe do cliente). */
export async function getConsumoIaDoCliente(
  holdingId: string,
  mes: string = mesCorrente(),
): Promise<{ mensagens: number; custoUsd: number; respostasMedidas: number }> {
  const admin = createAdminClient()
  const [uso, custos] = await Promise.all([
    admin
      .from("ia_chat_usage")
      .select("chamadas")
      .eq("holding_id", holdingId)
      .eq("mes", mes)
      .maybeSingle(),
    admin
      .from("ia_chat_custos")
      .select("custo_usd")
      .eq("holding_id", holdingId)
      .eq("mes", mes),
  ])
  const linhas = (custos.data ?? []) as { custo_usd: number | string }[]
  return {
    mensagens: (uso.data?.chamadas as number | undefined) ?? 0,
    custoUsd: linhas.reduce((s, l) => s + (Number(l.custo_usd) || 0), 0),
    respostasMedidas: linhas.length,
  }
}

export type ConsumoIaCliente = {
  holdingId: string
  cliente: string
  /** Mensagens do mês (de ia_chat_usage — a régua da cota). */
  mensagens: number
  inputTokens: number
  outputTokens: number
  webSearches: number
  custoUsd: number
  /** Respostas com custo medido (pode ser < mensagens: só conta o pós-instrumentação). */
  respostasMedidas: number
}

/**
 * Consumo de IA por cliente num mês (YYYY-MM). Junta a contagem de mensagens
 * (ia_chat_usage) com os tokens/custo (ia_chat_custos).
 */
export async function getConsumoIaPorCliente(
  mes: string = mesCorrente(),
): Promise<{ clientes: ConsumoIaCliente[]; totalUsd: number; totalMensagens: number }> {
  // Consumo/custo de TODOS os clientes é visão de dono — e dono FORA do
  // "ver como": dentro da visão de um cliente este painel vazaria dados dos
  // outros (mesma classe do vazamento de 01/09/26 no aviso de solicitações).
  if (!(await isSuperadmin()))
    return { clientes: [], totalUsd: 0, totalMensagens: 0 }
  const { getVerComoHoldingId } = await import("@/lib/auth/permissions")
  if (await getVerComoHoldingId())
    return { clientes: [], totalUsd: 0, totalMensagens: 0 }
  const admin = createAdminClient()
  const [holdingsRes, usoRes, custosRes] = await Promise.all([
    admin.from("holdings").select("id, name"),
    admin.from("ia_chat_usage").select("holding_id, chamadas").eq("mes", mes),
    admin
      .from("ia_chat_custos")
      .select(
        "holding_id, input_tokens, output_tokens, web_searches, custo_usd",
      )
      .eq("mes", mes),
  ])

  const nome = new Map<string, string>()
  for (const h of (holdingsRes.data ?? []) as { id: string; name: string }[])
    nome.set(h.id, h.name)

  const acc = new Map<string, ConsumoIaCliente>()
  const pega = (id: string): ConsumoIaCliente => {
    const atual = acc.get(id)
    if (atual) return atual
    const novo: ConsumoIaCliente = {
      holdingId: id,
      cliente: nome.get(id) ?? "(cliente removido)",
      mensagens: 0,
      inputTokens: 0,
      outputTokens: 0,
      webSearches: 0,
      custoUsd: 0,
      respostasMedidas: 0,
    }
    acc.set(id, novo)
    return novo
  }

  for (const u of (usoRes.data ?? []) as {
    holding_id: string
    chamadas: number
  }[]) {
    pega(u.holding_id).mensagens = u.chamadas ?? 0
  }
  for (const c of (custosRes.data ?? []) as {
    holding_id: string
    input_tokens: number
    output_tokens: number
    web_searches: number
    custo_usd: number | string
  }[]) {
    const item = pega(c.holding_id)
    item.inputTokens += c.input_tokens ?? 0
    item.outputTokens += c.output_tokens ?? 0
    item.webSearches += c.web_searches ?? 0
    item.custoUsd += Number(c.custo_usd) || 0
    item.respostasMedidas += 1
  }

  const clientes = [...acc.values()].sort(
    (a, b) => b.custoUsd - a.custoUsd || b.mensagens - a.mensagens,
  )
  return {
    clientes,
    totalUsd: clientes.reduce((s, c) => s + c.custoUsd, 0),
    totalMensagens: clientes.reduce((s, c) => s + c.mensagens, 0),
  }
}
