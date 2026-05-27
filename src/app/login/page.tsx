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
          {/* Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/login-hero.jpg"
            alt=""
            aria-hidden
            className="absolute inset-0 size-full object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

          {/* Foreground content */}
          <div className="relative z-10 flex h-full flex-col justify-between p-12">
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

            <div className="max-w-xl">
              <h1 className="text-5xl font-bold leading-[1.1] text-white">
                Transformando vidas{" "}
                <span className="text-[#ff4d1c]">com comida de qualidade</span>
              </h1>
              <p className="mt-6 text-base text-white/70">
                Sistema operacional da rede no canal delivery.
              </p>
            </div>

            <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-white/40">
              O melhor churrasco é feito na Cozina
            </p>
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
