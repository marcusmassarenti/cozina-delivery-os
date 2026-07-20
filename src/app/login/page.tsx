import { redirect } from "next/navigation"
import Link from "next/link"
import { BarChart3 } from "lucide-react"

import { DeliveryOsMark } from "@/components/delivery-os-logo"
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

            <div className="mt-auto max-w-xl">
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
                iFood, 99 Food e Keeta — pedidos, financeiro, avaliações e DRE
                consolidados, em tempo real.
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
              <DeliveryOsMark className="size-9" />
              <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                Delivery OS
              </span>
            </div>

            <div className="mb-8 flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <BarChart3 className="size-4" />
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
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
