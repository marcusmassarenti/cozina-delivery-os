import "server-only"

import { headers } from "next/headers"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Rate limiting via Postgres (RPC rate_limit_hit, migration 0088). Devolve
 * true se a ação está DENTRO do limite, false se estourou. Fail-open em erro
 * de infra (não trava usuário legítimo por falha do banco de rate limit).
 */
export async function rateLimit(
  key: string,
  max: number,
  windowSecs: number,
): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc("rate_limit_hit", {
      p_key: key,
      p_max: max,
      p_window_secs: windowSecs,
    })
    if (error) {
      console.error("rateLimit: erro na RPC:", error.message)
      return true
    }
    return data === true
  } catch (e) {
    console.error("rateLimit: exceção:", e)
    return true
  }
}

/** IP do cliente a partir dos headers (Vercel seta x-forwarded-for). */
export async function clientIp(): Promise<string> {
  const h = await headers()
  const xff = h.get("x-forwarded-for")
  if (xff) return xff.split(",")[0]!.trim()
  return h.get("x-real-ip") ?? "unknown"
}
