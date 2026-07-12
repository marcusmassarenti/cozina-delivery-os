/**
 * Autenticação da API pública (/api/v1) por chave de API.
 *
 * O cliente externo (ex.: ERP) manda `Authorization: Bearer <chave>`.
 * Guardamos só o HASH (SHA-256) da chave em `api_clients` — o texto puro
 * nunca toca o banco nem os logs. Aqui a gente faz hash do que veio e
 * busca por `key_hash`, checa ativo + escopo e marca `last_used_at`.
 */

import "server-only"

import { createHash } from "node:crypto"

import { createAdminClient } from "@/lib/supabase/admin"
import { getHoldingUnitIds } from "@/lib/data/units"

export type ApiClient = {
  id: string
  name: string
  scopes: string[]
  /** Empresa (holding) dona da chave. Os endpoints escopam os dados a ela. */
  holdingId: string | null
}

/** SHA-256 (hex) da chave — mesmo algoritmo do gerador de chaves. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex")
}

type VerifyResult =
  | { ok: true; client: ApiClient }
  | { ok: false; status: number; error: string }

/**
 * Valida a chave do header `Authorization: Bearer <chave>`.
 * @param scope permissão exigida pelo endpoint ("read" | "write")
 */
export async function verifyApiKey(
  req: Request,
  scope: "read" | "write" = "read",
): Promise<VerifyResult> {
  const header = req.headers.get("authorization") ?? ""
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  const key = match?.[1]?.trim()
  if (!key) {
    return {
      ok: false,
      status: 401,
      error: "Faltou a chave de API (header Authorization: Bearer <chave>).",
    }
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from("api_clients")
    .select("id, name, scopes, active, holding_id")
    .eq("key_hash", hashApiKey(key))
    .maybeSingle()

  if (!data || data.active !== true) {
    return { ok: false, status: 401, error: "Chave de API inválida ou inativa." }
  }

  const scopes = (data.scopes ?? []) as string[]
  if (!scopes.includes(scope)) {
    return {
      ok: false,
      status: 403,
      error: `A chave não tem permissão de '${scope}'.`,
    }
  }

  // Marca o último uso (best-effort).
  await admin
    .from("api_clients")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)

  return {
    ok: true,
    client: {
      id: data.id as string,
      name: data.name as string,
      scopes,
      holdingId: (data.holding_id as string | null) ?? null,
    },
  }
}

type ScopeResult =
  | { ok: true; unitIds: string[] }
  | { ok: false; status: number; error: string }

/**
 * Escopo de dados da chave: exige que ela esteja vinculada a uma empresa
 * (holding) e devolve os IDs das lojas dessa empresa. Todo endpoint da API
 * DEVE passar esses unitIds como filtro pras funções de rede — assim uma chave
 * só enxerga os dados da própria empresa (fail-closed: sem holding → 403).
 */
export async function apiScopeUnitIds(client: ApiClient): Promise<ScopeResult> {
  if (!client.holdingId) {
    return {
      ok: false,
      status: 403,
      error: "Chave de API não vinculada a uma empresa. Gere uma nova chave.",
    }
  }
  const unitIds = await getHoldingUnitIds(client.holdingId)
  return { ok: true, unitIds }
}

/** Resposta de erro JSON padronizada da API. */
export function apiError(status: number, error: string): Response {
  return Response.json({ error }, { status })
}
