import { redirect } from "next/navigation"
import { FlaskConical } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { getPlanoAtual } from "@/lib/data/assinatura"
import { asaasIsMock } from "@/lib/asaas/client"
import { fmtBRL } from "@/lib/format"

import { SimuladoActions } from "./_components/simulado-actions"

export const dynamic = "force-dynamic"

export default async function SimuladoPage({
  searchParams,
}: {
  searchParams: Promise<{ sub?: string }>
}) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect("/login")

  // Fora do modo simulado, não existe checkout de teste.
  if (!asaasIsMock()) redirect("/assinatura")

  const { sub } = await searchParams
  if (!sub) redirect("/assinatura")

  const plano = await getPlanoAtual()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
          <FlaskConical className="size-7" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">Pagamento simulado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O Asaas ainda não está configurado, então este é um checkout de{" "}
          <strong>teste</strong> — nada é cobrado de verdade. Aprovar aqui
          libera o acesso exatamente como o pagamento real faria.
        </p>

        <div className="mt-6 rounded-xl border bg-muted/30 p-4 text-left">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">Delivery OS · mensal</span>
            <span className="text-lg font-semibold tabular-nums">
              {plano ? fmtBRL(plano.mensalidade) : "—"}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Assinatura de teste {sub}
          </p>
        </div>

        <SimuladoActions sub={sub} />
      </div>
    </div>
  )
}
