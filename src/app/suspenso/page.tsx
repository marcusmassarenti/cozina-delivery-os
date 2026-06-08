import { redirect } from "next/navigation"
import { Lock } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { isSuperadmin } from "@/lib/auth/permissions"
import { getCurrentHoldingBilling } from "@/lib/data/billing"
import { signOut } from "@/app/login/_actions"
import { Button } from "@/components/ui/button"

export default async function SuspensoPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect("/login")

  const superadmin = await isSuperadmin()
  const billing = await getCurrentHoldingBilling()
  // Não está suspenso? Volta pro sistema.
  if (superadmin || billing?.status !== "suspended") redirect("/")

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
          <Lock className="size-7" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">Acesso suspenso</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O acesso da sua empresa está temporariamente bloqueado por pendência de
          pagamento. Assim que o pagamento for regularizado, o acesso volta
          automaticamente.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Dúvidas ou envio de comprovante:{" "}
          <a href="mailto:contato@cozinafoods.com" className="underline">
            contato@cozinafoods.com
          </a>
        </p>
        <form action={signOut} className="mt-6">
          <Button type="submit" variant="outline" className="w-full">
            Sair
          </Button>
        </form>
      </div>
    </div>
  )
}
