import { redirect } from "next/navigation"
import { ShieldCheck } from "lucide-react"

import { DeliveryOsMark } from "@/components/delivery-os-logo"
import { getMfaStatus } from "@/lib/auth/mfa"
import { createClient } from "@/lib/supabase/server"

import { SairLink } from "./_components/sair-link"
import { VerificacaoForm } from "./_components/verificacao-form"

export const metadata = { title: "Verificação em duas etapas — Delivery OS" }

/**
 * Segunda etapa do login, para quem ativou o 2FA. Só é alcançável por quem já
 * passou pela senha (sessão aal1); quem não deve código nenhum é mandado
 * adiante para não ficar preso numa tela sem sentido.
 */
export default async function VerificacaoPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect("/login")

  const mfa = await getMfaStatus()
  if (!mfa.precisaVerificar) redirect("/")

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <DeliveryOsMark className="size-9" />
          <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Delivery OS
          </span>
        </div>

        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <ShieldCheck className="size-4" />
          </div>
          <h1 className="text-xl font-semibold">Confirme que é você</h1>
        </div>

        <p className="mb-6 text-sm text-muted-foreground">
          Abra seu aplicativo autenticador e digite o código de 6 dígitos que
          aparece para o <b className="text-foreground">Delivery OS</b>.
        </p>

        <VerificacaoForm />

        <p className="mt-8 text-center text-[11px] leading-relaxed text-muted-foreground">
          Perdeu o acesso ao aplicativo? Peça a um administrador da sua empresa
          para desativar a verificação em duas etapas da sua conta.
          <br />
          <SairLink />
        </p>
      </div>
    </div>
  )
}
