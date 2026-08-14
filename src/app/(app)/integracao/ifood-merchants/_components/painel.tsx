"use client"

/**
 * Casca da tela de Merchants: abas + busca, e o conteúdo de cada aba.
 *
 * Existe porque o estado (aba ativa e texto buscado) é do CLIENTE, e a página
 * é Server Component. A primeira tentativa passou uma função de render como
 * prop pro componente de abas — função não atravessa a fronteira servidor →
 * cliente, e teria quebrado em produção. Aqui os dados chegam prontos (tudo
 * serializável) e o estado mora deste lado.
 */
import * as React from "react"

import { Abas, type Aba } from "./abas"
import { MerchantsTable } from "./merchants-table"
import { RevogadasAviso } from "./revogadas-aviso"
import { SolicitacoesPanel, type SolicitacaoAdmin } from "./solicitacoes-panel"
import type { MerchantSumido } from "@/lib/ifood/merchants-sumidos"

type Props = React.ComponentProps<typeof MerchantsTable>

export function PainelMerchants({
  sumidos,
  solicitacoes,
  contagens,
  ...tabela
}: {
  sumidos: MerchantSumido[]
  solicitacoes: SolicitacaoAdmin[]
  contagens: Record<Aba, number>
} & Omit<Props, "aba" | "busca">) {
  return (
    <Abas contagens={contagens}>
      {(aba, busca) => (
        <div className="flex flex-col gap-4">
          {/* Pendências reúne TUDO que espera ação: loja que sumiu, pedido de
              conexão e merchant sem unidade. Antes esses três moravam em
              alturas diferentes da mesma página, separados por blocos de
              consulta. */}
          {aba === "pendencias" && (
            <>
              <RevogadasAviso sumidos={sumidos} />
              <SolicitacoesPanel
                solicitacoes={solicitacoes}
                lojasDaRede={tabela.units}
                busca={busca}
              />
            </>
          )}

          {/* Os números só interessam na aba de consulta. Em "Pendências" eles
              roubariam o topo de quem veio resolver alguma coisa. */}
          {aba === "conectadas" && (
            <div className="grid gap-3 md:grid-cols-3">
              <StatCard
                label="Merchants no cache"
                value={String(tabela.merchants.length)}
              />
              <StatCard
                label="Vinculados a uma unidade"
                value={`${Object.keys(tabela.byMerchant).length}/${tabela.merchants.length}`}
              />
              <StatCard
                label="Unidades ativas na rede"
                value={String(tabela.units.length)}
              />
            </div>
          )}

          <MerchantsTable {...tabela} aba={aba} busca={busca} />
        </div>
      )}
    </Abas>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  )
}
