import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  ArrowUpRight,
  Plug,
  Store,
  UtensilsCrossed,
} from "lucide-react"

import { isSuperadmin } from "@/lib/auth/permissions"
import { getClientsOverview } from "@/lib/data/plataforma"
import { getSolicitacoesIfoodPendentes } from "@/lib/data/units"
import {
  installIdsDeProducao,
  unitIdsConectadosCw,
} from "@/lib/data/cardapioweb-imported"
import { type PlatformId } from "@/components/platform-logo"

import { createAdminClient } from "@/lib/supabase/admin"

import { ConexoesTable, type ConexaoRow } from "./_components/conexoes-table"

export default async function ConexoesPage() {
  if (!(await isSuperadmin())) notFound()
  const [{ clients }, solicitacoes, cwInstalls, cwConectadas, fila99] =
    await Promise.all([
      getClientsOverview(),
      getSolicitacoesIfoodPendentes(),
      installIdsDeProducao(),
      unitIdsConectadosCw(),
      createAdminClient()
        .from("ninefood_activation_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["pendente", "solicitada"]),
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
        // O Cardápio Web ficava de fora daqui ("tem tela própria"), mas o
        // painel é sobre QUEM ESTÁ CONECTADO — e canal próprio conectado é
        // exatamente isso. Deixá-lo fora fazia a contagem de lojas do topo
        // ignorar uma plataforma inteira.
        platforms: u.platforms as PlatformId[],
        ifoodApi: u.ifoodApi,
        ninefoodApi: u.ninefoodApi,
        cardapiowebApi: cwConectadas.has(u.id),
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
          {/* Atalhos pras duas telas de integração que não ficam no menu.
              Badge do iFood = cliente esperando na fila; o do Cardápio Web =
              lojas já conectadas, que é o número que se quer saber lá. */}
          <div className="flex flex-wrap items-center gap-2">
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
            <Link
              href="/integracao/99food"
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              <Store className="size-4" />
              99 Food
              {(fila99.count ?? 0) > 0 && (
                <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-[#FF6B00] px-1.5 text-[11px] font-semibold text-white">
                  {fila99.count}
                </span>
              )}
              <ArrowUpRight className="size-3.5 text-muted-foreground" />
            </Link>
            <Link
              href="/integracao/cardapioweb"
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              <UtensilsCrossed className="size-4" />
              Cardápio Web
              {cwInstalls.length > 0 && (
                <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[11px] font-semibold text-white">
                  {cwInstalls.length}
                </span>
              )}
              <ArrowUpRight className="size-3.5 text-muted-foreground" />
            </Link>
          </div>
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
