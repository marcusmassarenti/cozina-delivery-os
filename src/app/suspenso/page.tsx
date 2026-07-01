import { redirect } from "next/navigation"
import { Gift, Lock } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { isSuperadmin } from "@/lib/auth/permissions"
import { getCurrentHoldingBilling } from "@/lib/data/billing"
import { signOut } from "@/app/login/_actions"
import { Button } from "@/components/ui/button"

const ASSINAR_EMAIL =
  "mailto:suporte@deliveryos.food?subject=Quero%20assinar%20o%20Delivery%20OS"

export default async function SuspensoPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect("/login")

  const superadmin = await isSuperadmin()
  const billing = await getCurrentHoldingBilling()
  // Não está suspenso? Volta pro sistema.
  if (superadmin || billing?.status !== "suspended") redirect("/")

  // Suspenso por FIM DE TESTE (tem trial_ends_at) vs pendência de pagamento.
  const isTrial = !!billing?.trialEndsAt

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div
          className={`mx-auto flex size-14 items-center justify-center rounded-2xl ${
            isTrial
              ? "bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400"
              : "bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
          }`}
        >
          {isTrial ? <Gift className="size-7" /> : <Lock className="size-7" />}
        </div>

        {isTrial ? (
          <>
            <h1 className="mt-4 text-xl font-semibold">
              Seu teste grátis terminou
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Os 7 dias acabaram — esperamos que você tenha visto o lucro real
              da sua operação. Pra continuar com tudo, é só assinar. Seus dados
              ficam guardados.
            </p>
            <a
              href={ASSINAR_EMAIL}
              className="btn-brand mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold"
            >
              Quero assinar
            </a>
            <p className="mt-3 text-xs text-muted-foreground">
              Escreva pra{" "}
              <a
                href="mailto:suporte@deliveryos.food"
                className="underline hover:text-foreground"
              >
                suporte@deliveryos.food
              </a>{" "}
              que a gente te ajuda.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-xl font-semibold">Acesso suspenso</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              O acesso da sua empresa está temporariamente bloqueado por
              pendência de pagamento. Assim que for regularizado, volta
              automaticamente.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Dúvidas ou comprovante:{" "}
              <a
                href="mailto:suporte@deliveryos.food"
                className="underline hover:text-foreground"
              >
                suporte@deliveryos.food
              </a>
            </p>
          </>
        )}

        <form action={signOut} className="mt-6">
          <Button type="submit" variant="outline" className="w-full">
            Sair
          </Button>
        </form>
      </div>
    </div>
  )
}
