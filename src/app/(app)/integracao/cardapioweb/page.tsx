import Link from "next/link"
import {
  ChevronRight,
  ArrowLeft,
  Cake,
  Store,
  Store as StoreIcon,
  Utensils,
  Wallet,
} from "lucide-react"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  getFaturamentoCardapioWeb,
  getTopProdutos,
  type FaturamentoAnalytics,
  type ProdutoRank,
} from "@/lib/cardapioweb/analytics"
import { getResumoClientes, type ResumoClientes } from "@/lib/cardapioweb/clientes"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"

import { getVisibleUnits } from "@/lib/data/units"
import { isSuperadmin } from "@/lib/auth/roles"

import { CatalogoButton } from "./_components/catalogo-button"
import { ClientesButton } from "./_components/clientes-button"
import { ConectarLoja } from "./_components/conectar-loja"
import { SyncButton } from "./_components/sync-button"
import { VinculoUnidade } from "./_components/vinculo-unidade"

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
  unit_id: string | null
  units: { code: string; name: string } | null
}

type StateRow = {
  install_id: string
  backfill_cursor: string | null
  backfill_concluido: boolean
  ultimo_run_at: string | null
  ultimo_erro: string | null
  clientes_pagina: number
  clientes_total: number | null
  clientes_ultima_volta: string | null
}

type Stats = {
  installId: string
  pedidos: number
  detalhados: number
  faturamento: FaturamentoAnalytics
  /** null quando a loja está fechada na lista — não foi buscado. */
  clientes: ResumoClientes | null
  produtos: ProdutoRank[]
}

/**
 * `lojaAberta` = id da instalação expandida na tela.
 *
 * A análise pesada (top produtos, base de clientes) só é buscada pra ELA. Com
 * uma dezena de lojas conectadas, buscar tudo de todas fazia a página abrir
 * lenta pra mostrar um monte de painel que ninguém ia ler.
 */
async function carregar(lojaAberta: string | null) {
  const admin = createAdminClient()

  const [instRes, stRes] = await Promise.all([
    admin
      .from("cardapioweb_installs")
      .select(
        "id, ambiente, auth_mode, merchant_id, merchant_name, active, inactive_reason, scopes, unit_id, units(code, name)",
      )
      // Mais recente primeiro: quem acabou de conectar uma loja precisa vê-la
      // no topo, não embaixo do card antigo cheio de análise.
      .order("created_at", { ascending: false }),
    admin
      .from("cardapioweb_sync_state")
      .select(
        "install_id, backfill_cursor, backfill_concluido, ultimo_run_at, ultimo_erro, clientes_pagina, clientes_total, clientes_ultima_volta",
      ),
  ])

  const installs = (instRes.data ?? []) as unknown as InstallRow[]
  const states = (stRes.data ?? []) as StateRow[]
  const porInstall = new Map(states.map((s) => [s.install_id, s]))

  const stats: Stats[] = await Promise.all(
    installs.map(async (i) => {
      const aberta = i.id === lojaAberta
      const [tot, det, faturamento, clientes, produtos] = await Promise.all([
        admin
          .from("cardapioweb_pedidos")
          .select("id", { count: "exact", head: true })
          .eq("install_id", i.id),
        admin
          .from("cardapioweb_pedidos")
          .select("id", { count: "exact", head: true })
          .eq("install_id", i.id)
          .eq("detalhe_ok", true),
        getFaturamentoCardapioWeb(i.id),
        aberta ? getResumoClientes(i.id) : Promise.resolve(null),
        aberta ? getTopProdutos(i.id) : Promise.resolve([]),
      ])
      return {
        installId: i.id,
        pedidos: tot.count ?? 0,
        detalhados: det.count ?? 0,
        faturamento,
        clientes,
        produtos,
      }
    }),
  )
  const porStats = new Map(stats.map((s) => [s.installId, s]))

  return { installs, porInstall, porStats }
}

export default async function CardapioWebPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; sandbox?: string }>
}) {
  const sp = await searchParams
  const [{ installs, porInstall, porStats }, unidades, superadmin] =
    await Promise.all([
      carregar(sp.loja ?? null),
      getVisibleUnits(),
      isSuperadmin(),
    ])
  const opcoesUnidade = unidades
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, code: u.code, name: u.name }))
  const lojaAberta = sp.loja ?? null
  // Sandbox é ferramenta de quem constrói a integração, não de quem usa o
  // sistema. Some pro cliente; pra mim aparece com ?sandbox=1.
  const mostrarAmbiente = superadmin && sp.sandbox === "1"

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

      <ConectarLoja
        unidades={opcoesUnidade}
        redirectUri={process.env.CARDAPIOWEB_REDIRECT_URI ?? null}
        mostrarAmbiente={mostrarAmbiente}
      />

      {installs.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center">
          <Store className="mx-auto size-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium">Nenhuma loja conectada</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Conecte a primeira loja pelo fluxo de autorização do Cardápio Web.
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
          {installs.map((i) => {
            const st = porInstall.get(i.id)
            const s = porStats.get(i.id)
            const pct =
              s && s.pedidos > 0
                ? Math.round((s.detalhados / s.pedidos) * 100)
                : 0
            const fat = s?.faturamento
            const aberta = i.id === lojaAberta
            return (
              <div key={i.id} className="rounded-xl border bg-card p-5">
                {/* Cabeçalho + sync */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold">
                        {i.merchant_name ?? "(sem nome)"}
                      </h2>
                      {/* Sandbox em âmbar, não cinza: desde que o consolidado
                          passou a ignorar teste, "qual ambiente" deixou de ser
                          detalhe técnico e virou a diferença entre contar e
                          não contar no faturamento. */}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                          i.ambiente === "sandbox"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
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
                    </p>
                    {i.ambiente === "sandbox" && (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                        Ambiente de teste — o faturamento desta loja NÃO entra
                        no Dashboard, no DRE nem nos relatórios da rede.
                      </p>
                    )}
                    <VinculoUnidade
                      installId={i.id}
                      unidades={opcoesUnidade}
                      unitIdAtual={i.unit_id}
                    />
                    {i.inactive_reason && (
                      <p className="mt-1 text-xs text-rose-600">
                        {i.inactive_reason}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {aberta && (
                      <Link
                        href="/integracao/cardapioweb"
                        className="text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        Fechar análise
                      </Link>
                    )}
                    <SyncButton
                      installId={i.id}
                      concluido={st?.backfill_concluido ?? false}
                    />
                  </div>
                </div>

                {/* Métricas de sync */}
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
                    valor={fmtBRL(fat?.faturamento ?? 0)}
                    nota={`ticket médio ${fmtBRL(fat?.ticket ?? 0)}`}
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
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}

                {/* Análise detalhada: só da loja aberta. O resto da lista
                    fica leve, e nada pesado é sequer buscado no servidor. */}
                {aberta ? (
                  <>

                {/* Canal de origem — o trunfo que nenhuma outra tela tem */}
                {fat && fat.faturamento > 0 && (
                  <CanalDeOrigem fat={fat} />
                )}

                {/* Top produtos */}
                {s && s.produtos.length > 0 && (
                  <div className="mt-4 rounded-lg border bg-muted/20 p-4">
                    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Utensils className="size-3.5" />
                      Top produtos vendidos
                    </h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Sub-item de combo conta separado — é o que amarra na ficha
                      técnica.
                    </p>
                    <div className="mt-3 space-y-1.5">
                      {s.produtos.map((p, idx) => (
                        <div key={p.nome} className="flex items-center gap-3">
                          <span className="w-4 shrink-0 text-right text-[10px] font-bold tabular-nums text-muted-foreground">
                            {idx + 1}
                          </span>
                          <p className="min-w-0 flex-1 truncate text-xs font-medium">
                            {p.nome}
                            {p.combo && <Tag tom="violet">combo</Tag>}
                            {p.dentroDeCombo && <Tag tom="sky">dentro de combo</Tag>}
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

                {/* Base de clientes */}
                <div className="mt-4 rounded-lg border bg-muted/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Base de clientes
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {st?.clientes_total
                          ? `${fmtNum(st.clientes_total)} no Cardápio Web`
                          : "ainda não varrida"}
                        {st?.clientes_ultima_volta
                          ? " · cadastro atualizado"
                          : st && st.clientes_pagina > 1
                            ? ` · varredura na página ${st.clientes_pagina}`
                            : ""}
                      </p>
                    </div>
                    <ClientesButton installId={i.id} />
                    <CatalogoButton installId={i.id} />
                  </div>

                  {s?.clientes && s.clientes.total > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                      <Mini label="Cadastrados" valor={fmtNum(s.clientes.total)} />
                      <Mini
                        label="Novos no mês"
                        valor={fmtNum(s.clientes.novosNoMes)}
                      />
                      <Mini
                        label="Com cashback"
                        valor={fmtNum(s.clientes.comCashback)}
                        icone={<Wallet className="size-3" />}
                      />
                      <Mini
                        label="Cashback parado"
                        valor={fmtBRL(s.clientes.saldoCashback)}
                        destaque
                      />
                      <Mini label="Com pontos" valor={fmtNum(s.clientes.comPontos)} />
                      <Mini
                        label="Aniversário no mês"
                        valor={fmtNum(s.clientes.aniversariantesMes)}
                        icone={<Cake className="size-3" />}
                      />
                    </div>
                  )}
                </div>
                  </>
                ) : (
                  s &&
                  s.pedidos > 0 && (
                    <Link
                      href={`/integracao/cardapioweb?loja=${i.id}`}
                      className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      Ver análise da loja
                      <ChevronRight className="size-3.5" />
                    </Link>
                  )
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
    </div>
  )
}

/**
 * Faturamento por canal de origem. O Cardápio Web é hub, então sabe se o
 * pedido veio do canal próprio (sem comissão) ou de um marketplace. Essa é
 * a leitura que decide onde vale investir.
 */
function CanalDeOrigem({ fat }: { fat: FaturamentoAnalytics }) {
  const pctProprio =
    fat.faturamento > 0 ? (fat.proprioValor / fat.faturamento) * 100 : 0

  return (
    <div className="mt-4 rounded-lg border bg-muted/20 p-4">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <StoreIcon className="size-3.5" />
        De onde vem o faturamento
      </h3>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Canal próprio não paga comissão de marketplace — quanto maior, melhor
        a sua margem.
      </p>

      {/* Barra próprio × marketplace */}
      <div className="mt-3 flex items-center gap-3">
        <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-emerald-500"
            style={{ width: `${pctProprio}%` }}
          />
          <div
            className="h-full bg-orange-400"
            style={{ width: `${100 - pctProprio}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
          {fmtPct(pctProprio)} próprio
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[11px]">
        <span>
          <span className="inline-block size-2 rounded-full bg-emerald-500 align-middle" />{" "}
          Canal próprio:{" "}
          <b className="tabular-nums">{fmtBRL(fat.proprioValor)}</b>{" "}
          <span className="text-muted-foreground">
            ({fmtNum(fat.proprioPedidos)} ped.)
          </span>
        </span>
        <span>
          <span className="inline-block size-2 rounded-full bg-orange-400 align-middle" />{" "}
          Marketplaces:{" "}
          <b className="tabular-nums">{fmtBRL(fat.terceiroValor)}</b>{" "}
          <span className="text-muted-foreground">
            ({fmtNum(fat.terceiroPedidos)} ped.)
          </span>
        </span>
      </div>

      {/* Detalhe por canal */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {fat.porCanal.map((c) => (
          <div
            key={c.canal}
            className="flex items-center justify-between rounded-md border bg-background/40 px-3 py-1.5"
          >
            <span className="flex items-center gap-2 text-xs">
              <span
                className={`inline-block size-2 rounded-full ${
                  c.proprio ? "bg-emerald-500" : "bg-orange-400"
                }`}
              />
              {c.rotulo}
              <span className="text-[10px] text-muted-foreground">
                {fmtNum(c.pedidos)} ped.
              </span>
            </span>
            <span className="text-xs font-bold tabular-nums">
              {fmtBRL(c.valor)}
            </span>
          </div>
        ))}
      </div>

      {/* Formas de pagamento */}
      {fat.porPagamento.length > 0 && (
        <div className="mt-3 border-t pt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Formas de pagamento
          </p>
          <div className="flex flex-wrap gap-2">
            {fat.porPagamento.map((p) => (
              <span
                key={p.forma}
                className="rounded-md bg-muted px-2 py-1 text-[11px]"
              >
                {p.rotulo}{" "}
                <b className="tabular-nums">{fmtBRL(p.valor)}</b>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Tag({
  children,
  tom,
}: {
  children: React.ReactNode
  tom: "violet" | "sky"
}) {
  const cor =
    tom === "violet"
      ? "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400"
      : "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400"
  return (
    <span
      className={`ml-1.5 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${cor}`}
    >
      {children}
    </span>
  )
}

/** Métrica compacta do bloco de clientes. */
function Mini({
  label,
  valor,
  icone,
  destaque,
}: {
  label: string
  valor: string
  icone?: React.ReactNode
  destaque?: boolean
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {icone}
        {label}
      </p>
      <p
        className={`mt-0.5 text-sm font-bold tabular-nums ${
          destaque ? "text-emerald-700 dark:text-emerald-400" : ""
        }`}
      >
        {valor}
      </p>
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
