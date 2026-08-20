import Link from "next/link"
import { ArrowLeft, Shield, Store } from "lucide-react"

import { createAdminClient } from "@/lib/supabase/admin"
import { computeBillingStatus } from "@/lib/data/billing"
import { getLojasCompartilhadasPorHolding } from "@/lib/data/lojas-compartilhadas"

import { RefreshButton, RunSyncButton } from "@/app/(app)/integracao/ifood-merchants/_components/link-row"
import { PainelMerchants } from "@/app/(app)/integracao/ifood-merchants/_components/painel"
import type { SolicitacaoAdmin } from "@/app/(app)/integracao/ifood-merchants/_components/solicitacoes-panel"

type MerchantRow = {
  id: string
  name: string | null
  corporate_name: string | null
  cnpj: string | null
  city: string | null
  state: string | null
  /** Status da loja no iFood (AVAILABLE / UNAVAILABLE / DISABLED). */
  merchant_state: string | null
  ignorado_em: string | null
  ignorado_motivo: string | null
  last_seen_at: string
}

type LinkedRow = {
  unit_id: string
  api_store_id: string | null
  fin_enabled_at: string | null
  review_enabled_at: string | null
  units: {
    id: string
    code: string
    name: string
    active: boolean
    brand_id: string | null
  } | null
}

type UnitRow = {
  id: string
  code: string
  name: string
  holdingId: string
  holdingName: string
}

async function getData() {
  const admin = createAdminClient()
  const [merchantsRes, linkedRes, unitsRes, brandsRes, holdingsRes] =
    await Promise.all([
    admin
      .from("ifood_merchants")
      .select(
        "id, name, corporate_name, cnpj, city, state, merchant_state, ignorado_em, ignorado_motivo, last_seen_at",
      )
      .order("name"),
    admin
      .from("unit_platforms")
      .select(
        "unit_id, api_store_id, fin_enabled_at, review_enabled_at, units!inner(id, code, name, active, brand_id)",
      )
      .eq("platform", "ifood")
      .not("api_store_id", "is", null),
    admin
      .from("units")
      .select("id, code, name, brand_id")
      .eq("active", true)
      .order("code"),
    admin.from("brands").select("id, holding_id"),
    // trial_ends_at e suspend_on entram porque a tabela de merchants precisa
    // saber quem está SUSPENSO: cliente sem acesso não pode continuar
    // ocupando a lista de "conectadas" como se fosse operação viva.
    admin
      .from("holdings")
      .select("id, name, trial_ends_at, suspend_on, paid, due_date, encerrado_em"),
  ])
  const merchants = (merchantsRes.data ?? []) as MerchantRow[]
  const linkedRaw = (linkedRes.data ?? []) as unknown as LinkedRow[]

  // unit → holding (via brand) + nome da holding, pro filtro por cliente.
  const brandHolding = new Map<string, string>()
  for (const b of (brandsRes.data ?? []) as { id: string; holding_id: string }[])
    brandHolding.set(b.id, b.holding_id)
  const holdingName = new Map<string, string>()
  /**
   * Clientes SUSPENSOS (Marcus, 20/08/26: "aqui aparece mas cliente está
   * suspenso").
   *
   * A Vbfood continuava listada em "Conectadas" com as duas lojas vinculadas,
   * mesmo com o trial vencido em 14/08. A régua de cobrança já dizia
   * "suspended" e a tela de Clientes já escondia — só esta tabela não olhava.
   *
   * Vale a mesma lógica do resto: `computeBillingStatus` num lugar só, em vez
   * de mais uma cópia da regra aqui dentro.
   */
  const suspensos = new Set<string>()
  for (const h of (holdingsRes.data ?? []) as {
    id: string
    name: string
    trial_ends_at: string | null
    suspend_on: string | null
    paid: boolean | null
    due_date: string | null
    encerrado_em: string | null
  }[]) {
    holdingName.set(h.id, h.name)
    const st = computeBillingStatus({
      paid: h.paid ?? false,
      trialEndsAt: h.trial_ends_at,
      suspendOn: h.suspend_on,
      dueDate: h.due_date,
      paymentMethod: null,
      monthlyFee: null,
    })
    if (st === "suspended" || h.encerrado_em) suspensos.add(h.id)
  }

  const units: UnitRow[] = (
    (unitsRes.data ?? []) as {
      id: string
      code: string
      name: string
      brand_id: string
    }[]
  ).map((u) => {
    const hId = brandHolding.get(u.brand_id) ?? ""
    return {
      id: u.id,
      code: u.code,
      name: u.name,
      holdingId: hId,
      holdingName: holdingName.get(hId) ?? "—",
      /** Cliente sem acesso: a tabela marca e tira da contagem de conectadas. */
      suspenso: suspensos.has(hId),
    }
  })

  // Clientes (holdings) que têm unidade ativa — pro seletor do filtro.
  const holdingsComUnidade = new Map<string, string>()
  for (const u of units)
    if (u.holdingId) holdingsComUnidade.set(u.holdingId, u.holdingName)
  const holdings = [...holdingsComUnidade.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))

  // mapa merchant_id → unit (+ quais apps o admin já marcou como habilitados)
  const byMerchant: Record<
    string,
    {
      unitId: string
      code: string
      name: string
      finOn: boolean
      reviewOn: boolean
      /** De qual cliente é a loja — o merchant sozinho não diz. */
      holdingName: string
      /** Unidade desativada na rede, mas ainda vinculada ao merchant. */
      unidadeInativa: boolean
    }
  > = {}
  // Resolve o cliente pelo brand da PRÓPRIA linha vinculada, não pela lista
  // de unidades ativas: loja desativada continua vinculada (Niterói é o caso)
  // e caía num grupo sem nome, como se fosse de cliente nenhum.
  const holdingPorUnidade = new Map<string, string>()
  for (const l of linkedRaw) {
    if (!l.units) continue
    const hId = brandHolding.get(l.units.brand_id ?? "") ?? ""
    holdingPorUnidade.set(l.units.id, holdingName.get(hId) ?? "—")
  }
  for (const l of linkedRaw) {
    if (l.api_store_id && l.units) {
      byMerchant[l.api_store_id] = {
        unitId: l.units.id,
        code: l.units.code,
        name: l.units.name,
        finOn: !!l.fin_enabled_at,
        reviewOn: !!l.review_enabled_at,
        holdingName: holdingPorUnidade.get(l.units.id) ?? "—",
        unidadeInativa: l.units.active === false,
      }
    }
  }
  return { merchants, units, holdings, byMerchant }
}

/**
 * CNPJ pedido → cliente que pediu.
 *
 * É o que permite o seletor de vínculo mostrar só as lojas DAQUELE cliente.
 * Sem isso o admin escolhia entre as 63 unidades da base inteira, sem saber
 * de quem era cada uma — e vincular errado aqui mistura o faturamento de dois
 * clientes, que é o pior erro possível nesta tela.
 *
 * Vai SEM limite de status e sem `limit`: um merchant pode aparecer meses
 * depois do pedido, e cortar a lista deixaria justamente os casos antigos sem
 * sugestão.
 */
async function getDonoPorCnpj(): Promise<Record<string, { id: string; name: string }>> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("ifood_activation_requests")
    .select("cnpj, holding_id, holdings(name)")
  const out: Record<string, { id: string; name: string }> = {}
  for (const r of (data ?? []) as unknown as {
    cnpj: string | null
    holding_id: string | null
    holdings: { name: string } | null
  }[]) {
    const cnpj = String(r.cnpj ?? "").replace(/\D/g, "")
    if (!cnpj || !r.holding_id) continue
    // Primeiro pedido ganha: se dois clientes pediram o mesmo CNPJ, é conflito
    // pra humano resolver — e o seletor cai no "todas" de qualquer forma.
    if (!out[cnpj]) out[cnpj] = { id: r.holding_id, name: r.holdings?.name ?? "—" }
  }
  return out
}

/** Fila de solicitações de conexão feitas pelos clientes (todas as holdings). */
async function getSolicitacoes(): Promise<SolicitacaoAdmin[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("ifood_activation_requests")
    .select(
      "id, cnpj, status, status_anterior, nota, created_at, cliente_confirmou_at, lancado_no_portal_at, automacao_pausada_em, automacao_pausada_motivo, holding_id, holdings(name), units(code, name)",
    )
    // Arquivadas saem da FILA (o histórico continua no banco). Sem isso, uma
    // recusa antiga ficava aqui pra sempre e o painel virava um cemitério
    // misturado com o que de fato precisa de ação.
    //
    // ⚠️ AS ATIVAS TÊM QUE SAIR AQUI, não no componente. Enquanto o filtro era
    // `neq arquivada` + `limit(30)`, as ativas (que são a maioria e as mais
    // recentes) enchiam as 30 vagas e eram descartadas depois, na tela: em
    // 14/08/26 o painel dizia "7 aguardando" com 12 abertas no banco — as 3
    // Coringa da Prime e 2 da Tech simplesmente não existiam pra quem olhava.
    // Fila que esconde item sem avisar é pior que fila nenhuma: dá a sensação
    // de que está tudo despachado.
    .in("status", ["pendente", "solicitada", "recusada"])
    .order("created_at", { ascending: false })
    .limit(200)
  return (data ?? []).map((s) => {
    const h = s.holdings as unknown as { name: string } | null
    const u = s.units as unknown as { code: string; name: string } | null
    return {
      id: s.id as string,
      cnpj: s.cnpj as string,
      status: s.status as SolicitacaoAdmin["status"],
      nota: (s.nota as string | null) ?? null,
      lancadoNoPortal: Boolean(s.lancado_no_portal_at),
      holdingName: h?.name ?? "(sem empresa)",
      holdingId: (s.holding_id as string | null) ?? null,
      unitLabel: u ? `${u.code} · ${u.name}` : null,
      createdAt: s.created_at as string,
      clienteConfirmouAt:
        (s.cliente_confirmou_at as string | null) ?? null,
      statusAnterior: (s.status_anterior as string | null) ?? null,
      pausadaMotivo:
        (s.automacao_pausada_motivo as string | null) ??
        // Pausada sem motivo escrito não pode virar "não pausada" na tela: o
        // efeito (não cobra, não recusa) continua valendo e some do painel.
        (s.automacao_pausada_em ? "sem motivo escrito" : null),
    }
  })
}

/** Fila do iFood dentro da tela de Conexões. Ver `abas.tsx` pro porquê. */
export async function AbaIfood() {
  const { getAvisosFechados } = await import("@/lib/data/avisos-fechados")
  const { merchantsSumidos } = await import("@/lib/ifood/merchants-sumidos")
  const [
    { merchants, units, holdings, byMerchant },
    solicitacoes,
    donoPorCnpj,
    sumidos,
    avisosFechados,
  ] = await Promise.all([
    getData(),
    getSolicitacoes(),
    getDonoPorCnpj(),
    merchantsSumidos(),
    getAvisosFechados(),
  ])
  const linkedCount = Object.keys(byMerchant).length
  const ignorados = merchants.filter((m) => m.ignorado_em).length
  const semVinculo = merchants.filter(
    (m) => !m.ignorado_em && !byMerchant[m.id],
  ).length
  const solicitacoesAbertas = solicitacoes.filter(
    (s) => s.status === "pendente" || s.status === "solicitada",
  ).length

  // Lojas que cada cliente ACOMPANHA (de outra empresa), indexadas pelo NOME —
  // que é a chave por onde a tabela agrupa. Cliente que só acompanha não tem
  // merchant e, sem isto, não aparecia nesta tela: existia, pagava e era
  // invisível pra quem administra as conexões.
  const compartilhadasPorId = await getLojasCompartilhadasPorHolding()
  const nomePorHoldingId = new Map(holdings.map((h) => [h.id, h.name]))
  const compartilhadas: Record<
    string,
    { code: string; name: string; donaNome: string }[]
  > = {}
  for (const [holdingId, lojas] of compartilhadasPorId) {
    const nome = nomePorHoldingId.get(holdingId)
    if (!nome) continue
    compartilhadas[nome] = lojas.map((l) => ({
      code: l.code,
      name: l.name,
      donaNome: l.donaNome,
    }))
  }

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      {/* Volta pra Conexões de API, que é de onde se chega aqui hoje. Apontava
          pra tela de homologação — que era o caminho quando a integração ainda
          estava sendo homologada com o iFood, e virou um beco: quem clicava
          caía numa bateria de testes de endpoint sem entender por quê. */}
      <Link
        href="/clientes/conexoes"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Voltar para conexões
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

      {/* Três perguntas, três abas. Empilhadas, a que tem trabalho pendente
          ficava embaixo da que serve só pra consulta — e com 10 clientes e 200
          lojas isso vira uma página que ninguém lê até o fim. */}
      <PainelMerchants
        sumidos={sumidos}
        avisosFechados={[...avisosFechados]}
        solicitacoes={solicitacoes}
        contagens={{
          pendencias: solicitacoesAbertas + semVinculo + sumidos.length,
          conectadas: linkedCount,
          ignoradas: ignorados,
        }}
        merchants={merchants}
        units={units}
        holdings={holdings}
        byMerchant={byMerchant}
        donoPorCnpj={donoPorCnpj}
        compartilhadas={compartilhadas}
      />

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

      {/* Homologação: ferramenta de certificação, não de operação diária.
          Fechada por padrão — ela não pode competir com a fila, que é o que
          se olha todo dia, mas some da lista de telas se virar link solto. */}
      <details className="mt-6 rounded-xl border bg-card">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">
          Diagnóstico da API do iFood
        </summary>
        <div className="border-t px-4 py-3">
          <p className="mb-3 text-xs text-muted-foreground">
            Console de chamadas cruas, pra quando uma resposta do iFood precisar
            ser olhada por dentro — token, merchants, conciliação.
          </p>
          <Link
            href="/integracao/ifood-homolog"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            Abrir o console
          </Link>
        </div>
      </details>
    </div>
  )
}
