/**
 * GET /api/cardapioweb/oauth/start — inicia a conexão de uma loja.
 *
 * Gera o par PKCE (verifier fica no banco, challenge vai na URL) + o state
 * anti-CSRF, e manda o usuário pro portal do Cardápio Web pra autorizar.
 *
 * Só o perfil **Proprietário** da loja consegue autorizar do lado do
 * Cardápio Web — qualquer outro recebe `access_denied` lá. Do nosso lado,
 * exigimos admin da holding.
 *
 * Query:
 *   ambiente=sandbox|producao  (default: sandbox)
 *   unit_id=<uuid>             (opcional — já amarra a instalação à unidade)
 */
import { requireAdmin } from "@/lib/auth/guards"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import {
  gerarCodeChallenge,
  gerarCodeVerifier,
  gerarState,
  montarUrlAutorizacao,
  STATE_TTL_MS,
  type CwAmbiente,
} from "@/lib/cardapioweb/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  let userId: string
  let admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>
  try {
    const auth = await requireAdmin()
    userId = auth.userId
    admin = auth.admin
  } catch {
    return Response.json(
      { error: "Só administradores podem conectar uma loja." },
      { status: 403 },
    )
  }

  const holdingId = await getCurrentHoldingId()
  if (!holdingId) {
    return Response.json(
      { error: "Não consegui identificar a empresa do usuário." },
      { status: 400 },
    )
  }

  const url = new URL(req.url)
  const ambiente: CwAmbiente =
    url.searchParams.get("ambiente") === "producao" ? "producao" : "sandbox"
  const unitId = url.searchParams.get("unit_id")

  const state = gerarState()
  const codeVerifier = gerarCodeVerifier()

  const { error } = await admin.from("cardapioweb_oauth_states").insert({
    state,
    holding_id: holdingId,
    unit_id: unitId,
    ambiente,
    code_verifier: codeVerifier,
    created_by: userId,
    expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
  })
  if (error) {
    return Response.json(
      { error: `Falha ao iniciar a conexão: ${error.message}` },
      { status: 500 },
    )
  }

  // Limpeza oportunista dos states vencidos (não precisa de cron pra isso).
  void admin
    .from("cardapioweb_oauth_states")
    .delete()
    .lt("expires_at", new Date().toISOString())

  let destino: string
  try {
    destino = montarUrlAutorizacao({
      ambiente,
      state,
      codeChallenge: gerarCodeChallenge(codeVerifier),
    })
  } catch (e) {
    // Falta client_id/redirect_uri no ambiente — erro de configuração nossa.
    return Response.json(
      { error: e instanceof Error ? e.message : "Configuração incompleta." },
      { status: 500 },
    )
  }

  return Response.redirect(destino, 302)
}
