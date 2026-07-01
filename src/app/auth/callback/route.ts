import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

/**
 * Callback do link de confirmação de e-mail (Supabase). Troca o `code` por uma
 * sessão e joga o usuário pro app já logado. Erro → login com aviso.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/"

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }
  return NextResponse.redirect(`${origin}/login?erro=confirmacao`)
}
