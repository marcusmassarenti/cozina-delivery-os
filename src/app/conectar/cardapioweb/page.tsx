import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/**
 * Porta de entrada PÚBLICA pra quem clica em "Instalar" na CW App Store.
 *
 * Fica fora do grupo (app) de propósito. Lá dentro, o layout manda todo mundo
 * sem sessão pro /login seco — e a intenção morre no caminho: o lojista clicou
 * em INSTALAR, chegou com o convite na mão, e caiu num login que não explica
 * nada. Depois de entrar ele vai parar no dashboard, sem lembrança nenhuma de
 * que estava conectando o Cardápio Web.
 *
 * Aqui a intenção sobrevive: sem sessão, mandamos pro login com `next`
 * apontando de volta pra cá. Ao voltar, emenda direto na autorização.
 *
 * A tela `/integracao/cardapioweb` também emenda sozinha (pelo Referer), mas só
 * funciona pra quem JÁ está logado. Esta rota cobre o resto — e é a que vale
 * pedir ao Cardápio Web pra cadastrar como URL de onboarding do app.
 */
export default async function ConectarCardapioWebPage({
  searchParams,
}: {
  searchParams: Promise<{ ambiente?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()

  // O ambiente vem da URL quando explícito, senão do portal de onde a pessoa
  // veio. Precisa viajar na URL porque, depois do login, o Referer é a NOSSA
  // tela de login — a origem original se perde ali.
  const referer = (await headers()).get("referer") ?? ""
  const ambiente =
    sp.ambiente === "sandbox" || referer.includes("portal.sandbox.cardapioweb")
      ? "sandbox"
      : "producao"

  if (!data.user) {
    const volta = `/conectar/cardapioweb?ambiente=${ambiente}`
    redirect(`/login?next=${encodeURIComponent(volta)}`)
  }

  redirect(`/api/cardapioweb/oauth/start?ambiente=${ambiente}`)
}
