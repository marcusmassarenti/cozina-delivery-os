import { NextResponse, type NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/middleware"

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Sondas de readiness (preview do Claude, monitores de uptime) batem em
  // `HEAD /`. Respondemos 200 sem corpo — não afeta a navegação real (GET).
  if (request.method === "HEAD" && pathname === "/") {
    return new NextResponse(null, { status: 200 })
  }

  // A RAIZ É A LANDING. O sistema mora em /inicio.
  //
  // Antes o dashboard ocupava "/" e a landing só aparecia por um desvio no
  // domínio do SaaS — o que deixava a tela principal sem endereço próprio:
  // não dava pra mandar o link do painel pra ninguém, e o histórico do
  // navegador guardava "deliveryos.food" tanto pra página de vendas quanto
  // pro sistema.
  //
  // Quem está LOGADO não vê a página de vendas: vai direto pro sistema. É o
  // caso do cliente que confirma o e-mail e cai em "/".
  if (pathname === "/") {
    const hasAuthCookie = request.cookies
      .getAll()
      .some((c) => c.name.includes("auth-token"))
    if (hasAuthCookie) {
      const { response, user } = await updateSession(request)
      if (user) {
        const url = request.nextUrl.clone()
        url.pathname = "/inicio"
        return NextResponse.redirect(url)
      }
      void response
    }
    // Visitante → landing por REWRITE: a URL na barra continua sendo a raiz,
    // que é o endereço que a gente divulga.
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
