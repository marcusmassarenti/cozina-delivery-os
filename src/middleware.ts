import { NextResponse, type NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/middleware"

// Domínio da landing do SaaS. A raiz desse domínio mostra a landing
// (/deliveryos) em vez do app. Trocar aqui se o domínio mudar.
const LANDING_HOSTS = new Set(["deliveryos.food", "www.deliveryos.food"])

export async function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase()
  const isLandingHost = LANDING_HOSTS.has(host)
  const pathname = request.nextUrl.pathname

  // Sondas de readiness (preview do Claude, monitores de uptime) batem em
  // `HEAD /`. Respondemos 200 sem corpo — não afeta a navegação real (GET).
  if (request.method === "HEAD" && pathname === "/") {
    return new NextResponse(null, { status: 200 })
  }

  // deliveryos.food/  → landing pra VISITANTE; app (dashboard) pra quem está
  // LOGADO. Assim o cliente que confirma o e-mail e cai em "/" vê o sistema,
  // não a página de vendas. O app principal (cozinafoods) não é afetado.
  if (isLandingHost && pathname === "/") {
    const hasAuthCookie = request.cookies
      .getAll()
      .some((c) => c.name.includes("auth-token"))
    if (hasAuthCookie) {
      const { response, user } = await updateSession(request)
      if (user) return response // logado → segue pro dashboard do app
    }
    // sem sessão → landing (rewrite, mantém a URL na barra)
    const url = request.nextUrl.clone()
    url.pathname = "/deliveryos"
    return NextResponse.rewrite(url)
  }

  const { response } = await updateSession(request)
  return response
}

export const config = {
  matcher: [
    // Pula /api (tem auth própria por chave) e os estáticos.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
