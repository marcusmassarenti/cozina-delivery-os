import Link from "next/link"
import { ArrowLeft, Shield, Store } from "lucide-react"

import { createAdminClient } from "@/lib/supabase/admin"

import { LinkRow, RefreshButton, RunSyncButton } from "./_components/link-row"
import {
  SolicitacoesPanel,
  type SolicitacaoAdmin,
} from "./_components/solicitacoes-panel"

type MerchantRow = {
  id: string
  name: string | null
  corporate_name: string | null
  cnpj: string | null
  city: string | null
  state: string | null
  last_seen_at: string
}

type LinkedRow = {
  unit_id: string
  api_store_id: string | null
  units: { id: string; code: string; name: string } | null
}

type UnitRow = {
  id: string
  code: string
  name: string
}

async function getData() {
  const admin = createAdminClient()
  const [merchantsRes, linkedRes, unitsRes] = await Promise.all([
    admin
      .from("ifood_merchants")
      .select("id, name, corporate_name, cnpj, city, state, last_seen_at")
      .order("name"),
    admin
      .from("unit_platforms")
      .select("unit_id, api_store_id, units!inner(id, code, name)")
      .eq("platform", "ifood")
      .not("api_store_id", "is", null),
    admin
      .from("units")
      .select("id, code, name")
      .eq("active", true)
      .order("code"),
  ])
  const merchants = (merchantsRes.data ?? []) as MerchantRow[]
  const linkedRaw = (linkedRes.data ?? []) as unknown as LinkedRow[]
  const units = (unitsRes.data ?? []) as UnitRow[]

  // mapa merchant_id → unit
  const byMerchant: Record<string, { unitId: string; code: string; name: string }> = {}
  for (const l of linkedRaw) {
    if (l.api_store_id && l.units) {
      byMerchant[l.api_store_id] = {
        unitId: l.units.id,
        code: l.units.code,
        name: l.units.name,
      }
    }
  }
  return { merchants, units, byMerchant }
}

/** Fila de solicitações de conexão feitas pelos clientes (todas as holdings). */
async function getSolicitacoes(): Promise<SolicitacaoAdmin[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("ifood_activation_requests")
    .select(
      "id, cnpj, status, nota, created_at, holdings(name), units(code, name)",
    )
    .order("created_at", { ascending: false })
    .limit(30)
  return (data ?? []).map((s) => {
    const h = s.holdings as unknown as { name: string } | null
    const u = s.units as unknown as { code: string; name: string } | null
    return {
      id: s.id as string,
      cnpj: s.cnpj as string,
      status: s.status as SolicitacaoAdmin["status"],
      nota: (s.nota as string | null) ?? null,
      holdingName: h?.name ?? "(sem empresa)",
      unitLabel: u ? `${u.code} · ${u.name}` : null,
      createdAt: s.created_at as string,
    }
  })
}

export default async function IfoodMerchantsPage() {
  const [{ merchants, units, byMerchant }, solicitacoes] = await Promise.all([
    getData(),
    getSolicitacoes(),
  ])
  const linkedCount = Object.keys(byMerchant).length

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <Link
        href="/integracao/ifood-homolog"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Voltar para homologação
      </Link>

      <div className="flex items-end justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Store className="size-6 text-orange-500" />
            Merchants iFood
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vincule cada loja retornada pela Merchant API a uma unidade da rede.
            Isso destrava o cron diário <code className="font-mono">/api/cron/ifood-sync</code> em
            produção.
          </p>
        </div>
        <div className="flex items-start gap-2">
          <RunSyncButton />
          <RefreshButton />
        </div>
      </div>

      <SolicitacoesPanel solicitacoes={solicitacoes} />

      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Merchants no cache" value={String(merchants.length)} />
        <StatCard
          label="Vinculados a uma unidade"
          value={`${linkedCount}/${merchants.length}`}
        />
        <StatCard label="Unidades ativas na rede" value={String(units.length)} />
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
                <td colSpan={5} className="px-3 py-12 text-center text-muted-foreground">
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
                      <p className="font-medium">{m.name ?? m.corporate_name ?? "—"}</p>
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
                          <span className="text-muted-foreground">— {linked.name}</span>
                          <LinkRow
                            merchantId={m.id}
                            currentUnitId={linked.unitId}
                            units={units}
                          />
                        </div>
                      ) : (
                        <LinkRow merchantId={m.id} currentUnitId={null} units={units} />
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border bg-card p-4 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5 font-medium text-foreground">
          <Shield className="size-3.5 text-orange-500" />
          Como o cron usa esses vínculos
        </p>
        <p className="mt-1 leading-relaxed">
          O cron diário <code className="font-mono">/api/cron/ifood-sync</code> (06:00 BRT)
          lê <code className="font-mono">unit_platforms.api_store_id</code>. Para cada
          unidade com merchant vinculado, dispara Reconciliation (mês corrente + anterior)
          e Financial Events (últimos 7 dias) com throttle de 6h.
        </p>
      </div>
    </div>
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
