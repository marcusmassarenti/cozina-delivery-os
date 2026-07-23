"use client"

import * as React from "react"
import { Filter } from "lucide-react"

import { LinkRow } from "./link-row"

type MerchantRow = {
  id: string
  name: string | null
  corporate_name: string | null
  cnpj: string | null
  city: string | null
  state: string | null
}
type UnitOption = {
  id: string
  code: string
  name: string
  holdingId: string
  holdingName: string
}
type Linked = { unitId: string; code: string; name: string }

/**
 * Tabela de merchants + vínculo à unidade, com FILTRO POR CLIENTE.
 *
 * A Merchant API do iFood não expõe o CNPJ, então o sistema não sabe sozinho
 * de qual cliente é cada merchant. O filtro resolve na mão: você escolhe o
 * cliente que está conectando (ex.: DG FOODS) e todos os seletores de unidade
 * passam a mostrar SÓ as lojas dele — evita vincular na loja de outro cliente.
 */
export function MerchantsTable({
  merchants,
  units,
  holdings,
  byMerchant,
}: {
  merchants: MerchantRow[]
  units: UnitOption[]
  holdings: { id: string; name: string }[]
  byMerchant: Record<string, Linked>
}) {
  const [cliente, setCliente] = React.useState<string>("todos")
  const unitsFiltradas = React.useMemo(
    () =>
      cliente === "todos"
        ? units
        : units.filter((u) => u.holdingId === cliente),
    [units, cliente],
  )
  const nomeCliente =
    cliente === "todos"
      ? null
      : holdings.find((h) => h.id === cliente)?.name ?? null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Filter className="size-3.5" />
          Vincular às lojas do cliente:
        </span>
        <select
          value={cliente}
          onChange={(e) => setCliente(e.target.value)}
          className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
        >
          <option value="todos">Todos os clientes</option>
          {holdings.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
        {nomeCliente && (
          <span className="text-[11px] text-muted-foreground">
            os seletores abaixo mostram só as lojas de <b>{nomeCliente}</b> (
            {unitsFiltradas.length})
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Nome</th>
              <th className="px-3 py-2 text-left font-medium">CNPJ</th>
              <th className="px-3 py-2 text-left font-medium">Cidade</th>
              <th className="px-3 py-2 text-left font-medium">Merchant ID</th>
              <th className="px-3 py-2 text-left font-medium">Unidade da rede</th>
            </tr>
          </thead>
          <tbody>
            {merchants.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-12 text-center text-muted-foreground"
                >
                  Nenhum merchant na cache ainda — clique em{" "}
                  <strong>Re-puxar da Merchant API</strong>.
                </td>
              </tr>
            ) : (
              merchants.map((m) => {
                const linked = byMerchant[m.id]
                return (
                  <tr key={m.id} className="border-t align-middle">
                    <td className="px-3 py-2">
                      <p className="font-medium">
                        {m.name ?? m.corporate_name ?? "—"}
                      </p>
                      {m.corporate_name && m.corporate_name !== m.name && (
                        <p className="text-[10px] text-muted-foreground">
                          {m.corporate_name}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">
                      {m.cnpj ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {[m.city, m.state].filter(Boolean).join("/") || "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                      {m.id}
                    </td>
                    <td className="px-3 py-2">
                      {linked ? (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{linked.code}</span>
                          <span className="text-muted-foreground">
                            — {linked.name}
                          </span>
                          <LinkRow
                            merchantId={m.id}
                            currentUnitId={linked.unitId}
                            units={unitsFiltradas}
                          />
                        </div>
                      ) : (
                        <LinkRow
                          merchantId={m.id}
                          currentUnitId={null}
                          units={unitsFiltradas}
                        />
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
