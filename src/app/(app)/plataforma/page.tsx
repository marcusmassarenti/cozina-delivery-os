import { notFound } from "next/navigation"
import { Building2, Store, Users } from "lucide-react"

import { isSuperadmin } from "@/lib/auth/permissions"
import { getClientsOverview } from "@/lib/data/plataforma"
import { fmtNum } from "@/lib/format"

import { NovoClienteDialog } from "./_components/novo-cliente-dialog"

/**
 * Painel de Dono da plataforma (super-admin) — visão de todos os clientes.
 * Só o super-admin enxerga. É o cockpit do SaaS.
 */
export default async function PlataformaPage() {
  if (!(await isSuperadmin())) notFound()
  const { clients, totals } = await getClientsOverview()

  const kpis = [
    { label: "Clientes", value: totals.clients, icon: Building2 },
    { label: "Lojas", value: totals.units, sub: `${totals.activeUnits} ativas`, icon: Store },
    { label: "Usuários", value: totals.users, icon: Users },
  ]

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Building2 className="size-6 text-muted-foreground" />
            Clientes da plataforma
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Visão de dono — todas as empresas que usam o Cozina Delivery OS.
          </p>
        </div>
        <NovoClienteDialog />
      </div>

      {/* KPIs da plataforma */}
      <div className="grid gap-3 sm:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <k.icon className="size-4" />
              {k.label}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {fmtNum(k.value)}
            </div>
            {k.sub && (
              <div className="text-[11px] text-muted-foreground">{k.sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* Lista de clientes */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Cliente</th>
                <th className="px-4 py-2.5 text-right font-semibold">Lojas</th>
                <th className="px-4 py-2.5 text-right font-semibold">Usuários</th>
                <th className="px-4 py-2.5 text-right font-semibold">Desde</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {c.slug}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmtNum(c.units)}
                    <span className="text-[11px] text-muted-foreground">
                      {" "}
                      ({c.activeUnits} ativas)
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmtNum(c.users)}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                    {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    Nenhum cliente ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Use <strong>Novo cliente</strong> pra provisionar uma empresa (cria a
        loja e o admin dela). Próximo passo: <strong>entrar num cliente</strong>{" "}
        pra ver os dados dele por dentro.
      </p>
    </div>
  )
}
