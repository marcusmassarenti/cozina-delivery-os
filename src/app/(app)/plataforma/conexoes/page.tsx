import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Plug } from "lucide-react"

import { isSuperadmin } from "@/lib/auth/permissions"
import { getClientsOverview } from "@/lib/data/plataforma"
import type { PlatformId } from "@/components/platform-logo"

import { ConexoesTable, type ConexaoRow } from "./_components/conexoes-table"

export default async function ConexoesPage() {
  if (!(await isSuperadmin())) notFound()
  const { clients } = await getClientsOverview()

  // Achata as lojas de todos os clientes numa lista só.
  const rows: ConexaoRow[] = []
  for (const c of clients) {
    for (const u of c.unitsList) {
      rows.push({
        unitId: u.id,
        unitCode: u.code,
        unitName: u.name,
        cidade: [u.city, u.state].filter(Boolean).join(" / ") || null,
        ativa: u.active,
        cliente: c.name,
        clienteId: c.id,
        platforms: u.platforms as PlatformId[],
        ifoodApi: u.ifoodApi,
        ninefoodApi: u.ninefoodApi,
      })
    }
  }
  rows.sort(
    (a, b) =>
      a.cliente.localeCompare(b.cliente, "pt-BR") ||
      a.unitName.localeCompare(b.unitName, "pt-BR"),
  )

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/plataforma"
          className="inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Voltar para clientes
        </Link>
        <div className="flex items-center gap-2.5">
          <Plug className="size-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">
            Conexões de API
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Todas as lojas dos clientes e o que cada uma tem conectado por API.
          Clique numa plataforma pra ver só as lojas que a usam. Loja conectada
          via API puxa o financeiro sozinha; as demais dependem de importação de
          planilha.
        </p>
      </div>

      <ConexoesTable rows={rows} />
    </div>
  )
}
