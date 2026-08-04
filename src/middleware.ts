import { NextResponse, type NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/middleware"
import { COOKIE_VER_COMO } from "@/lib/auth/ver-como"

/** Métodos que mudam alguma coisa. GET/HEAD/OPTIONS passam. */
const ESCRITA = new Set(["POST", "PUT", "PATCH", "DELETE"])

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

  // TRAVA DE SOMENTE-LEITURA do "ver como o cliente".
  //
  // Enquanto o cookie existir, nada que escreva passa. A trava é pelo MÉTODO,
  // e não por uma lista de rotas, porque Server Action posta na URL da própria
  // página: não há caminho pra liberar ou bloquear. O efeito colateral bom é
  // que a proteção é fail-closed — tela nova com botão de salvar já nasce
  // travada, sem ninguém precisar lembrar de protegê-la.
  //
  // Vale até pra quem forjou o cookie sem ser superadmin: nesse caso ele não
  // vê dado nenhum de ninguém (o portão está em permissions.ts) e ainda
  // bloqueia as próprias escritas. Trocar segurança por autolesão é um
  // negócio aceitável.
  //
  // Sair da visão é um GET (/api/ver-como/sair) justamente pra escapar daqui.
  if (
    request.cookies.has(COOKIE_VER_COMO) &&
    ESCRITA.has(request.method) &&
    !pathname.startsWith("/api/ver-como/")
  ) {
    return NextResponse.json(
      {
        erro: "somente_leitura",
        mensagem:
          "Você está vendo o sistema como um cliente. Saia dessa visão para poder alterar qualquer coisa.",
      },
      { status: 403 },
    )
  }

  // Fora a trava acima, /api continua como sempre foi: autenticação própria
  // (chave de API, segredo de cron, assinatura de webhook) e SEM passar pela
  // renovação de sessão. Elas só entraram no matcher pra que a trava de
  // somente-leitura as alcance — mudar o resto do comportamento delas aqui
  // seria efeito colateral de um recurso que não tem nada a ver com isso.
  if (pathname.startsWith("/api")) return NextResponse.next()

  const { response } = await updateSession(request)
  return response
}

export const config = {
  matcher: [
    // Pula os estáticos. /api ENTRA (antes ficava de fora) só pra que a trava
    // de somente-leitura do "ver como o cliente" alcance as rotas que
    // escrevem — logo depois dela o middleware devolve /api intacto, sem
    // renovar sessão, que é como sempre funcionou.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
