import "server-only"

import { createClient } from "@supabase/supabase-js"

/**
 * Cliente Supabase com service_role — bypassa RLS.
 * USAR SOMENTE NO SERVIDOR (Server Components, Server Actions, Route Handlers).
 * O import "server-only" garante erro de build se alguém tentar usar no browser.
 *
 * Quando autenticação for implementada, queries de leitura passam a usar o
 * cliente do servidor com a sessão do usuário (server.ts), e isso aqui só
 * sobra pra ações administrativas (CRUD de unidades pelo holding-admin).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      "Faltam variáveis SUPABASE: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY",
    )
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
