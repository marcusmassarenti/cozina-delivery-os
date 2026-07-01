import { NextResponse, type NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/middleware"

// Domínio da landing do SaaS. A raiz desse domínio mostra a landing
// (/deliveryos) em vez do app. Trocar aqui se o domínio mudar.
const LANDING_HOSTS = new Set(["deliveryos.food", "www.deliveryos.food"])

export async function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase()

  // deliveryos.food/  → serve a landing (rewrite, mantém a URL na barra).
  // O app principal (delivery.cozinafoods.com) não é afetado.
  if (LANDING_HOSTS.has(host) && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone()
    url.pathname = "/deliveryos"
    return NextResponse.rewrite(url)
  }

  // Sondas de readiness (preview do Claude, monitores de uptime) batem em
  // `HEAD /`. Como o layout do grupo (app) redireciona quem não tem sessão
  // pro /login (307), essas sondas ficam penduradas esperando um 2xx. Aqui
  // respondemos HEAD / com 200 sem corpo — não afeta a navegação real (GET),
  // que continua redirecionando pro login normalmente.
  if (request.method === "HEAD" && request.nextUrl.pathname === "/") {
    return new NextResponse(null, { status: 200 })
  }
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Pula /api (tem auth própria por chave) e os estáticos.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
