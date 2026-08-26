import { redirect } from "next/navigation"
import Link from "next/link"
import { BarChart3, ShieldAlert } from "lucide-react"

import { DeliveryOsMark } from "@/components/delivery-os-logo"
import { PlatformLogo } from "@/components/platform-logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { TooltipProvider } from "@/components/ui/tooltip"
import { createClient } from "@/lib/supabase/server"
import { LoginForm } from "./_components/login-form"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ recuperado?: string; next?: string }>
}) {
  const sp = await searchParams

  /**
   * Nome da plataforma quando o login veio de um link de CONEXÃO.
   *
   * O `next` é o único sinal disponível: `/conectar/cardapioweb` chega aqui
   * como `next=%2Fconectar%2Fcardapioweb`. Vale pras próximas também — se
   * amanhã existir `/conectar/99food`, basta a linha no mapa.
   */
  const plataformaDoNext = (() => {
    const alvo = decodeURIComponent(sp.next ?? "")
    if (!alvo.startsWith("/conectar/")) return null
    const mapa: Record<string, string> = {
      cardapioweb: "Cardápio Web",
      "99food": "99 Food",
      ifood: "iFood",
      keeta: "Keeta",
    }
    const slug = alvo.split("/")[2]?.split("?")[0] ?? ""
    return mapa[slug] ?? null
  })()
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (data.user) {
    redirect("/inicio")
  }

  return (
    <TooltipProvider>
      <div className="grid min-h-screen lg:grid-cols-2">
        {/* Hero panel — SEMPRE genérico do Delivery OS. O login é compartilhado
            (antes de saber qual cliente é), então nunca mostra a marca de um
            tenant específico. */}
        <div className="relative hidden overflow-hidden bg-zinc-950 lg:block">
          {/* Brilhos abstratos com a cor da marca */}
          <div className="absolute -left-32 top-12 size-[460px] rounded-full bg-[#ff4d1c]/25 blur-[130px]" />
          <div className="absolute -right-24 bottom-0 size-[420px] rounded-full bg-[#ff4d1c]/15 blur-[130px]" />
          {/* Grade sutil */}
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage:
                "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
              backgroundSize: "44px 44px",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/70" />

          <div className="relative z-10 flex h-full flex-col p-12">
            <div className="flex items-center gap-2">
              <DeliveryOsMark className="size-9" />
              <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/80">
                Delivery OS
              </span>
            </div>

            {/* Chamada centralizada verticalmente entre o logo e o rodapé. */}
            <div className="my-auto max-w-xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/70">
                <BarChart3 className="size-3 text-[#ff4d1c]" />
                Gestão de Delivery
              </div>
              <h1 className="text-[1.75rem] font-bold leading-[1.2] text-white drop-shadow-lg xl:text-[2.5rem]">
                Toda a sua operação
                <br />
                <span className="text-[#ff4d1c]">num só painel.</span>
              </h1>
              <p className="mt-6 max-w-md text-sm leading-relaxed text-white/60">
                iFood, 99 Food, Keeta e Cardápio Web — pedidos, financeiro,
                avaliações e DRE consolidados, em tempo real.
              </p>
            </div>

            {/* Rodapé: faixa discreta com as plataformas que o sistema lê. */}
            <div className="flex items-center gap-3 border-t border-white/10 pt-5">
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">
                Integrado com
              </span>
              <div className="flex items-center gap-2">
                <PlatformLogo platform="ifood" size="sm" />
                <PlatformLogo platform="99food" size="sm" />
                <PlatformLogo platform="keeta" size="sm" />
                <PlatformLogo platform="cardapioweb" size="sm" />
              </div>
            </div>
          </div>
        </div>

        {/* Form panel */}
        <div className="relative flex flex-col justify-center bg-background p-8 lg:p-16">
          <div className="absolute right-6 top-6">
            <ThemeToggle />
          </div>

          <div className="mx-auto w-full max-w-sm">
            {/* Mobile logo */}
            <div className="mb-8 flex items-center gap-2 lg:hidden">
              <DeliveryOsMark className="size-9" />
              <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                Delivery OS
              </span>
            </div>

            {/* Veio de um código de recuperação: sem este aviso, a pessoa
                não entende por que voltou pra tela de login. */}
            {sp.recuperado === "1" && (
              <div className="mb-6 flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-400">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  <b>Código de recuperação aceito.</b> A verificação em duas
                  etapas foi desativada. Entre com e-mail e senha e cadastre seu
                  novo aparelho em Minha conta → Segurança.
                </span>
              </div>
            )}

            {/* Veio de um link de CONEXÃO de plataforma.
                ── POR QUE (Marcus, 27/08/26) ──────────────────────────────
                Um cliente passou a manhã travado em
                deliveryos.food/conectar/cardapioweb: sem sessão, a rota manda
                pro /login, e ele digitava ali o e-mail e a senha DO CARDÁPIO
                WEB. Nas palavras dele: "loguei normalmente no cardápio web,
                mas no deliveryOS fala que o email e senha está incorreto".
                As credenciais estavam certas — só eram de outro sistema.
                A tela dizia "Acesso Administrativo" e mais nada, então tentar
                a senha da plataforma que ele veio conectar é o comportamento
                óbvio, não o descuido dele. */}
            {plataformaDoNext && (
              <div className="mb-6 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  Entre com a sua conta do <b>Delivery OS</b> — não com o login
                  do <b>{plataformaDoNext}</b>. Assim que entrar, você volta
                  direto para a autorização.
                </span>
              </div>
            )}

            <div className="mb-8 flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <BarChart3 className="size-4" />
              </div>
              <h2 className="text-xl font-semibold">Acesso Administrativo</h2>
            </div>

            <LoginForm next={sp.next} />

            {/* Caminho pro cadastro. O /cadastro sempre teve "Já tem conta?
                Entrar", mas o login não tinha o inverso — e é aqui que a maioria
                cai, porque o link do login é o que circula. Quem chegava sem
                conta ficava sem saída visível: ou adivinhava a URL, ou desistia. */}
            <div className="mt-7 border-t pt-5 text-center">
              <p className="text-sm text-muted-foreground">
                É novo por aqui?{" "}
                <Link
                  href="/cadastro"
                  className="font-medium text-primary hover:underline"
                >
                  Criar minha conta
                </Link>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                7 dias grátis, sem cartão de crédito.
              </p>
            </div>

            <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
              Ao acessar, você concorda com os{" "}
              <Link href="/termos" className="underline hover:text-foreground">
                Termos de Uso
              </Link>{" "}
              e a{" "}
              <Link href="/privacidade" className="underline hover:text-foreground">
                Política de Privacidade
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
