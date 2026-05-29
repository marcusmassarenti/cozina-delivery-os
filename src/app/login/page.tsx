import { redirect } from "next/navigation"
import { Flame } from "lucide-react"

import { ThemeToggle } from "@/components/theme-toggle"
import { TooltipProvider } from "@/components/ui/tooltip"
import { createClient } from "@/lib/supabase/server"
import { LoginForm } from "./_components/login-form"

export default async function LoginPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (data.user) {
    redirect("/")
  }

  return (
    <TooltipProvider>
      <div className="grid min-h-screen lg:grid-cols-2">
        {/* Hero panel */}
        <div className="relative hidden overflow-hidden lg:block">
          {/* Background base preto */}
          <div className="absolute inset-0 bg-zinc-950" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/cnp.jpg"
            alt=""
            aria-hidden
            className="absolute inset-0 size-full object-cover opacity-55 [object-position:55%_55%]"
          />
          {/* Overlay leve na esquerda pra dar contraste no texto sem
              esmagar o logo CNP que precisa ficar em evidência. */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent" />
          {/* Vinheta pra escurecer só os extremos — meio fica respirando
              pra ver o fogo do CNP. */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/95" />

          {/* Foreground content — header em cima, texto principal+slogan
              empurrados pro pé da página pra dar respiro ao logo CNP */}
          <div className="relative z-10 flex h-full flex-col p-12">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/cozina-logo.png"
                alt="Cozina"
                className="h-9 w-auto"
              />
              <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/80">
                Delivery OS
              </span>
            </div>

            {/* mt-auto empurra esse bloco pro final, mostrando o logo CNP
                (com o fogo) limpo na parte superior */}
            <div className="mt-auto max-w-2xl">
              <h1 className="text-[1.75rem] font-bold leading-[1.2] text-white drop-shadow-lg xl:text-[2.25rem]">
                Transformando vidas
                <br />
                <span className="whitespace-nowrap text-[#ff4d1c]">
                  com comida de qualidade
                </span>
              </h1>
              <p className="mt-8 text-[10px] font-medium uppercase tracking-[0.3em] text-white/50">
                Fazendo Churrasco desde 2021
              </p>
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

            <p className="mt-8 text-center text-[11px] text-muted-foreground">
              Powered by Cozina Foods
            </p>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
