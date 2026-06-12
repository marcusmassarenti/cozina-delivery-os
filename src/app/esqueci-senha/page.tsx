import { redirect } from "next/navigation"
import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { DeliveryOsWordmark } from "@/components/delivery-os-logo"
import { EsqueciForm } from "./_components/esqueci-form"

export default async function EsqueciSenhaPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (data.user) redirect("/")

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <DeliveryOsWordmark subtitle={false} />
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Recuperar senha</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Informe seu e-mail e enviaremos um link pra você criar uma nova senha.
          </p>
          <div className="mt-5">
            <EsqueciForm />
          </div>
        </div>
        <p className="mt-6 text-center text-sm">
          <Link
            href="/login"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Voltar ao login
          </Link>
        </p>
      </div>
    </div>
  )
}
