import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getContaInfo } from "@/lib/data/conta"
import { asaasIsMock } from "@/lib/asaas/client"
import { ContaInfoForm } from "../_components/conta-info-form"

export const dynamic = "force-dynamic"

export default async function InformacoesTab() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect("/login")

  const info = await getContaInfo()
  if (!info)
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Não foi possível carregar os dados da conta.
      </div>
    )

  return <ContaInfoForm info={info} mock={asaasIsMock()} />
}
