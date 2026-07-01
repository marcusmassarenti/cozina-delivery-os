import { redirect } from "next/navigation"
import Link from "next/link"
import { Check } from "lucide-react"

import { DeliveryOsMark } from "@/components/delivery-os-logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { TooltipProvider } from "@/components/ui/tooltip"
import { createClient } from "@/lib/supabase/server"
import { SignupForm } from "./_components/signup-form"

export const metadata = {
  title: "Comece grátis — Delivery OS",
  description:
    "Crie sua conta e teste o Delivery OS por 7 dias, sem cartão. Veja o lucro real de cada plataforma num painel só.",
}

const BENEFICIOS = [
  "7 dias grátis, sem cartão de crédito",
  "iFood, 99 Food e Keeta num painel só",
  "Suba suas planilhas e veja o lucro real",
  "Cancela quando quiser",
]

export default async function CadastroPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (data.user) redirect("/")

  return (
    <TooltipProvider>
      <div className="grid min-h-screen lg:grid-cols-2">
        {/* Hero panel */}
        <div className="relative hidden overflow-hidden bg-zinc-950 lg:block">
          <div className="absolute -left-32 top-12 size-[460px] rounded-full bg-[#ff4d1c]/25 blur-[130px]" />
          <div className="absolute -right-24 bottom-0 size-[420px] rounded-full bg-[#ff4d1c]/15 blur-[130px]" />
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
                7 dias grátis
              </div>
              <h1 className="text-[1.75rem] font-bold leading-[1.2] text-white drop-shadow-lg xl:text-[2.5rem]">
                Descubra quanto você
                <br />
                <span className="text-[#ff4d1c]">realmente ganha.</span>
              </h1>
              <ul className="mt-7 space-y-3">
                {BENEFICIOS.map((b) => (
                  <li key={b} className="flex items-center gap-3 text-sm text-white/70">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#ff4d1c]/20 text-[#ff4d1c]">
                      <Check className="size-3" strokeWidth={2.6} />
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Form panel */}
        <div className="relative flex flex-col justify-center bg-background p-8 lg:p-16">
          <div className="absolute right-6 top-6">
            <ThemeToggle />
          </div>

          <div className="mx-auto w-full max-w-sm">
            <div className="mb-8 flex items-center gap-2 lg:hidden">
              <DeliveryOsMark className="size-9" />
              <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                Delivery OS
              </span>
            </div>

            <div className="mb-7">
              <h2 className="text-xl font-semibold">Crie sua conta grátis</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                7 dias pra ver o lucro real do seu delivery. Sem cartão.
              </p>
            </div>

            <SignupForm />

            <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
              Ao criar a conta, você concorda com os{" "}
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
