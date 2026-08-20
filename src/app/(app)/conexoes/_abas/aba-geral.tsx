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
import { ehClienteArquivado } from "@/lib/data/cliente-arquivado"
import { getSolicitacoesIfoodPendentes } from "@/lib/data/units"
import {
  installIdsDeProducao,
  unitIdsConectadosCw,
} from "@/lib/data/cardapioweb-imported"
import { type PlatformId } from "@/components/platform-logo"

import { createAdminClient } from "@/lib/supabase/admin"

import { ConexoesTable, type ConexaoRow } from "@/app/(app)/clientes/conexoes/_components/conexoes-table"

export async function AbaGeral() {
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
    // Marca o CLIENTE, não a loja: suspensão e trial vencido são da conta.
    const arquivado = ehClienteArquivado(c)
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
        arquivado,
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
      {/* O cabeçalho saiu: as ABAS já dizem onde você está, e os atalhos pra
          iFood/99/Cardápio Web viraram as próprias abas. Repetir os dois seria
          oferecer dois caminhos pro mesmo lugar na mesma tela. */}
      <div className="flex flex-col gap-2">
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
