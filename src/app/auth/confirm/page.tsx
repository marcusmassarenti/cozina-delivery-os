import { MailCheck } from "lucide-react"

import { DeliveryOsMark } from "@/components/delivery-os-logo"
import { ConfirmButton } from "./_components/confirm-button"

export const metadata = {
  title: "Confirmar e-mail — Delivery OS",
}

export default async function AuthConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>
}) {
  const sp = await searchParams
  const tokenHash = sp.token_hash ?? ""
  const type = sp.type ?? "signup"

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex items-center gap-2">
          <DeliveryOsMark className="size-8" />
          <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Delivery OS
          </span>
        </div>

        <div className="mx-auto mt-6 flex size-14 items-center justify-center rounded-2xl bg-orange-100 text-[#ff4d1c] dark:bg-orange-950/30">
          <MailCheck className="size-7" />
        </div>

        <h1 className="mt-4 text-xl font-semibold">Confirmar seu e-mail</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Clique no botão abaixo pra ativar sua conta e começar seus{" "}
          <span className="font-medium text-foreground">7 dias grátis</span>.
        </p>

        {tokenHash ? (
          <ConfirmButton tokenHash={tokenHash} type={type} />
        ) : (
          <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
            Link incompleto. Abra o link direto do e-mail de confirmação.
          </p>
        )}
      </div>
    </div>
  )
}
