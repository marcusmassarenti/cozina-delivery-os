import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowRight, MailCheck } from "lucide-react"

import { DeliveryOsMark } from "@/components/delivery-os-logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { ResendButton } from "./_components/resend-button"

export const metadata = {
  title: "Confirme seu e-mail — Delivery OS",
}

export default async function ConfirmePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const sp = await searchParams
  const email = (sp.email ?? "").trim()
  // Sem e-mail no link → veio de fora do fluxo; manda pro cadastro.
  if (!email) redirect("/cadastro")

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex items-center gap-2">
          <DeliveryOsMark className="size-8" />
          <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Delivery OS
          </span>
        </div>

        <div className="mx-auto mt-6 flex size-14 items-center justify-center rounded-2xl bg-[var(--brand-soft,theme(colors.orange.100))] text-[#ff4d1c] dark:bg-orange-950/30">
          <MailCheck className="size-7" />
        </div>

        <h1 className="mt-4 text-xl font-semibold">Confirme seu e-mail</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enviamos um link de confirmação para{" "}
          <span className="font-medium text-foreground">{email}</span>. Clique
          nele pra ativar sua conta e começar seus{" "}
          <span className="font-medium text-foreground">7 dias grátis</span>.
        </p>

        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-left text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          📁 <strong>Não achou?</strong> Olhe a caixa de <strong>spam / lixo
          eletrônico</strong>. Se estiver lá, marque como{" "}
          <em>&quot;não é spam&quot;</em> pra os próximos chegarem na principal.
        </div>

        <ResendButton email={email} />

        <div className="mt-6 border-t pt-5">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Já confirmei — fazer login
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}
