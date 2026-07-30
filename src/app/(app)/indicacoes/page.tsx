/**
 * Programa de indicação — tela do dono.
 *
 * Responde duas perguntas: quem trouxe quem, e quanto eu devo pagar de Pix
 * este mês.
 */
import { redirect } from "next/navigation"
import { Share2 } from "lucide-react"

import { isSuperadmin } from "@/lib/auth/permissions"
import { listarIndicadores, listarComissoes } from "@/lib/data/indicacoes"

import { IndicacoesView } from "./_components/indicacoes-view"

export const dynamic = "force-dynamic"

export default async function IndicacoesPage() {
  if (!(await isSuperadmin())) redirect("/inicio")

  const [indicadores, comissoes] = await Promise.all([
    listarIndicadores(),
    listarComissoes(),
  ])

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.deliveryos.food"

  return (
    <div className="flex flex-1 flex-col gap-5 bg-muted/30 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Share2 className="size-6 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Indicações</h1>
      </div>
      <IndicacoesView indicadores={indicadores} comissoes={comissoes} site={site} />
    </div>
  )
}
