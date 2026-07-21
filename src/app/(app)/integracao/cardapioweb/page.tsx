import Link from "next/link"
import { ArrowLeft, Store, Utensils } from "lucide-react"

import { createAdminClient } from "@/lib/supabase/admin"
import { fmtBRL, fmtNum } from "@/lib/format"

import { SyncButton } from "./_components/sync-button"

export const dynamic = "force-dynamic"

type InstallRow = {
  id: string
  ambiente: string
  auth_mode: string
  merchant_id: string | null
  merchant_name: string | null
  active: boolean
  inactive_reason: string | null
  scopes: string[] | null
  units: { code: string; name: string } | null
}

type StateRow = {
  install_id: string
  backfill_cursor: string | null
  backfill_concluido: boolean
  ultimo_run_at: string | null
  ultimo_erro: string | null
}

async function carregar() {
  const admin = createAdminClient()

  const [instRes, stRes] = await Promise.all([
    admin
      .from("cardapioweb_installs")
      .select(
        "id, ambiente, auth_mode, merchant_id, merchant_name, active, inactive_reason, scopes, units(code, name)",
      )
      .order("created_at"),
    admin
      .from("cardapioweb_sync_state")
      .select(
        "install_id, backfill_cursor, backfill_concluido, ultimo_run_at, ultimo_erro",
      ),
  ])

  const installs = (instRes.data ?? []) as unknown as InstallRow[]
  const states = (stRes.data ?? []) as StateRow[]
  const porInstall = new Map(states.map((s) => [s.install_id, s]))

  // Contagens por loja (o head:true traz só o count, sem puxar linha).
  const stats = await Promise.all(
    installs.map(async (i) => {
      const [tot, det, itens] = await Promise.all([
        admin
          .from("cardapioweb_pedidos")
          .select("id", { count: "exact", head: true })
          .eq("install_id", i.id),
        admin
          .from("cardapioweb_pedidos")
          .select("id", { count: "exact", head: true })
          .eq("install_id", i.id)
          .eq("detalhe_ok", true),
        admin
          .from("cardapioweb_pedidos")
          .select("total")
          .eq("install_id", i.id)
          .eq("detalhe_ok", true),
      ])
      const soma = (itens.data ?? []).reduce(
        (s, r) => s + (Number(r.total) || 0),
        0,
      )
      return {
        installId: i.id,
        pedidos: tot.count ?? 0,
        detalhados: det.count ?? 0,
        faturamento: soma,
      }
    }),
  )
  const porStats = new Map(stats.map((s) => [s.installId, s]))

  return { installs, porInstall, porStats }
}

/** Top produtos — prova de que os itens (e os sub-itens de combo) entraram. */
async function topProdutos() {
  const admin = createAdminClient()
  const { data } = await admin
    .from("cardapioweb_pedido_itens")
    .select("nome, quantidade, preco_total, kind, parent_item_id")
    .limit(2000)

  const acc = new Map<
    string,
    { nome: string; qtd: number; valor: number; combo: boolean; dentroDeCombo: boolean }
  >()
  for (const r of data ?? []) {
    const nome = r.nome ?? "(sem nome)"
    const cur = acc.get(nome) ?? {
      nome,
      qtd: 0,
      valor: 0,
      combo: r.kind === "combo",
      dentroDeCombo: r.parent_item_id !== null,
    }
    cur.qtd += Number(r.quantidade) || 0
    cur.valor += Number(r.preco_total) || 0
    if (r.parent_item_id !== null) cur.dentroDeCombo = true
    acc.set(nome, cur)
  }
  return Array.from(acc.values())
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10)
}

export default async function CardapioWebPage() {
  const [{ installs, porInstall, porStats }, produtos] = await Promise.all([
    carregar(),
    topProdutos(),
  ])

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <Link
          href="/importacao"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar para importação
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">
          Integração Cardápio Web
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada loja conecta a própria conta. O histórico entra em lotes — o
          sync é retomável, então pode rodar quantas vezes precisar.
        </p>
      </div>

      {installs.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center">
          <Store className="mx-auto size-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium">Nenhuma loja conectada</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Conecte a primeira loja pelo fluxo de autorização do Cardápio Web.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {installs.map((i) => {
            const st = porInstall.get(i.id)
            const s = porStats.get(i.id)
            const pct =
              s && s.pedidos > 0
                ? Math.round((s.detalhados / s.pedidos) * 100)
                : 0
            return (
              <div key={i.id} className="rounded-xl border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold">
                        {i.merchant_name ?? "(sem nome)"}
                      </h2>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {i.ambiente}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {i.auth_mode === "api_key" ? "API key" : "OAuth"}
                      </span>
                      {!i.active && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                          inativa
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Loja no Cardápio Web: {i.merchant_id ?? "—"}
                      {i.units
                        ? ` · vinculada a ${i.units.code} ${i.units.name}`
                        : " · ainda sem unidade vinculada"}
                    </p>
                    {i.inactive_reason && (
                      <p className="mt-1 text-xs text-rose-600">
                        {i.inactive_reason}
                      </p>
                    )}
                  </div>
                  <SyncButton
                    installId={i.id}
                    concluido={st?.backfill_concluido ?? false}
                  />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Metrica
                    label="Pedidos"
                    valor={fmtNum(s?.pedidos ?? 0)}
                    nota="cabeçalhos importados"
                  />
                  <Metrica
                    label="Detalhados"
                    valor={`${fmtNum(s?.detalhados ?? 0)} · ${pct}%`}
                    nota="com itens e pagamento"
                  />
                  <Metrica
                    label="Faturamento"
                    valor={fmtBRL(s?.faturamento ?? 0)}
                    nota="dos pedidos detalhados"
                  />
                  <Metrica
                    label="Histórico até"
                    valor={st?.backfill_cursor ?? "—"}
                    nota={
                      st?.backfill_concluido
                        ? "backfill concluído"
                        : "ainda voltando no tempo"
                    }
                  />
                </div>

                {s && s.pedidos > 0 && (
                  <div className="mt-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}

                {st?.ultimo_erro && (
                  <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
                    Último erro: {st.ultimo_erro}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {produtos.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Utensils className="size-4 text-muted-foreground" />
            Top produtos vendidos
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Sai direto dos itens do pedido. Sub-item de combo conta separado —
            é o que amarra na ficha técnica.
          </p>
          <div className="mt-4 space-y-2">
            {produtos.map((p, idx) => (
              <div key={p.nome} className="flex items-center gap-3">
                <span className="w-4 shrink-0 text-right text-[10px] font-bold tabular-nums text-muted-foreground">
                  {idx + 1}
                </span>
                <p className="min-w-0 flex-1 truncate text-xs font-medium">
                  {p.nome}
                  {p.combo && (
                    <span className="ml-1.5 rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-violet-700 dark:bg-violet-950/40 dark:text-violet-400">
                      combo
                    </span>
                  )}
                  {p.dentroDeCombo && (
                    <span className="ml-1.5 rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-sky-700 dark:bg-sky-950/40 dark:text-sky-400">
                      dentro de combo
                    </span>
                  )}
                </p>
                <span className="shrink-0 text-xs font-bold tabular-nums">
                  {fmtBRL(p.valor)}
                </span>
                <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                  {fmtNum(p.qtd)} un
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Metrica({
  label,
  valor,
  nota,
}: {
  label: string
  valor: string
  nota: string
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-bold tabular-nums">{valor}</p>
      <p className="text-[10px] text-muted-foreground">{nota}</p>
    </div>
  )
}
