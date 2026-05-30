/**
 * Leitura das chaves de API (api_clients) pra tela Conexões.
 * NUNCA retorna o hash nem a chave — só metadados (prefixo, escopo, uso).
 */

import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export type ApiClientRow = {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  active: boolean
  createdAt: string
  lastUsedAt: string | null
}

export async function listApiClients(): Promise<ApiClientRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("api_clients")
    .select("id, name, key_prefix, scopes, active, created_at, last_used_at")
    .order("created_at", { ascending: false })
  if (error) {
    console.error("listApiClients error:", error.message)
    return []
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    keyPrefix: r.key_prefix as string,
    scopes: (r.scopes ?? []) as string[],
    active: r.active as boolean,
    createdAt: r.created_at as string,
    lastUsedAt: (r.last_used_at as string | null) ?? null,
  }))
}
