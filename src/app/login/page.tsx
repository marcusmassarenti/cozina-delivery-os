import { redirect } from "next/navigation"
import Link from "next/link"
import { Flame } from "lucide-react"

import { ThemeToggle } from "@/components/theme-toggle"
import { TooltipProvider } from "@/components/ui/tooltip"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { LoginForm } from "./_components/login-form"

export default async function LoginPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (data.user) {
    redirect("/")
  }

  // Imagem da tela de login (definida pelo dono na Personalização). Se não
  // houver, o hero é genérico. Falha silenciosa se a coluna ainda não existir.
  let loginImage: string | null = null
  try {
    const admin = createAdminClient()
    const { data: row } = await admin
      .from("holdings")
      .select("login_image_url")
      .not("login_image_url", "is", null)
      .order("created_at")
      .limit(1)
      .maybeSingle()
    loginImage = (row?.login_image_url as string | null) ?? null
  } catch {
    loginImage = null
  }

  return (
    <TooltipProvider>
      <div className="grid min-h-screen lg:grid-cols-2">
        {loginImage ? (
          <div className="relative hidden overflow-hidden bg-zinc-950 lg:block">
            <div className="absolute inset-0 bg-zinc-950" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={loginImage}
              alt=""
              aria-hidden
              className="absolute inset-0 size-full object-cover opacity-60 [object-position:55%_55%]"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/95" />
            <div className="relative z-10 flex h-full flex-col p-12">
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/cozina-logo.png" alt="Cozina" className="h-9 w-auto" />
                <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/80">
                  Delivery OS
                </span>
              </div>
              <div className="mt-auto max-w-2xl">
                <h1 className="text-[1.75rem] font-bold leading-[1.2] text-white drop-shadow-lg xl:text-[2.5rem]">
                  Toda a sua operação
                  <br />
                  <span className="text-[#ff4d1c]">num só painel.</span>
                </h1>
              </div>
            </div>
          </div>
        ) : (
        /* Hero panel — genérico (white-label, sem marca de restaurante) */
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/cozina-logo.png" alt="Cozina" className="h-9 w-auto" />
              <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/80">
                Delivery OS
              </span>
            </div>

            <div className="mt-auto max-w-xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/70">
                <Flame className="size-3 text-[#ff4d1c]" />
                Gestão de Delivery
              </div>
              <h1 className="text-[1.75rem] font-bold leading-[1.2] text-white drop-shadow-lg xl:text-[2.5rem]">
                Toda a sua operação
                <br />
                <span className="text-[#ff4d1c]">num só painel.</span>
              </h1>
              <p className="mt-6 max-w-md text-sm leading-relaxed text-white/60">
                iFood, 99 Food e Keeta — pedidos, financeiro, avaliações e DRE
                consolidados, em tempo real.
              </p>
            </div>
          </div>
        </div>
        )}

        {/* Form panel */}
        <div className="relative flex flex-col justify-center bg-background p-8 lg:p-16">
          <div className="absolute right-6 top-6">
            <ThemeToggle />
          </div>

          <div className="mx-auto w-full max-w-sm">
            {/* Mobile logo */}
            <div className="mb-8 flex items-center gap-2 lg:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/cozina-logo.png"
                alt="Cozina"
                className="h-9 w-auto"
              />
              <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                Delivery OS
              </span>
            </div>

            <div className="mb-8 flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <Flame className="size-4" />
              </div>
              <h2 className="text-xl font-semibold">Acesso Administrativo</h2>
            </div>

            <LoginForm />

            <p className="mt-8 text-center text-[11px] leading-relaxed text-muted-foreground">
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
            <p className="mt-3 text-center text-[10px] text-muted-foreground/70">
              Powered by Cozina Foods
            </p>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
