import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ArrowUpRight, Plug, Store } from "lucide-react"

import { isSuperadmin } from "@/lib/auth/permissions"
import { getClientsOverview } from "@/lib/data/plataforma"
import { getSolicitacoesIfoodPendentes } from "@/lib/data/units"
import {
  ehMarketplace,
  type MarketplaceId,
} from "@/components/platform-logo"

import { ConexoesTable, type ConexaoRow } from "./_components/conexoes-table"

export default async function ConexoesPage() {
  if (!(await isSuperadmin())) notFound()
  const [{ clients }, solicitacoes] = await Promise.all([
    getClientsOverview(),
    getSolicitacoesIfoodPendentes(),
  ])

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
        // Painel de conexões cobre só marketplace (é sobre credencial
        // de API/planilha); o Cardápio Web tem tela própria.
        platforms: u.platforms.filter(ehMarketplace) as MarketplaceId[],
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
          href="/clientes"
          className="inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Voltar para clientes
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Plug className="size-5 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">
              Conexões de API
            </h1>
          </div>
          {/* Atalho pra tela de gerenciar as conexões iFood (fila de
              solicitações + vincular merchant à unidade), que não fica no
              menu. Badge quando há cliente esperando. */}
          <Link
            href="/integracao/ifood-merchants"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Store className="size-4" />
            Gerenciar conexões iFood
            {solicitacoes.total > 0 && (
              <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-[#EA1D2C] px-1.5 text-[11px] font-semibold text-white">
                {solicitacoes.total}
              </span>
            )}
            <ArrowUpRight className="size-3.5 text-muted-foreground" />
          </Link>
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
