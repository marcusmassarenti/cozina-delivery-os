import Link from "next/link"
import { ArrowLeft, Shield, Store } from "lucide-react"

import { createAdminClient } from "@/lib/supabase/admin"
import { clientesForaDaOperacao } from "@/lib/data/clientes-fora-da-operacao"
import { HOLDING_DEMO_ID } from "@/lib/data/holding-demo"
import { getLojasCompartilhadasPorHolding } from "@/lib/data/lojas-compartilhadas"

import { RefreshButton, RunSyncButton } from "@/app/(app)/integracao/ifood-merchants/_components/link-row"
import { PainelMerchants } from "@/app/(app)/integracao/ifood-merchants/_components/painel"
import type { SolicitacaoAdmin } from "@/app/(app)/integracao/ifood-merchants/_components/solicitacoes-panel"
import {
  ConexaoDistribuida,
  type ConexaoDist,
} from "@/app/(app)/integracao/ifood-merchants/_components/conexao-distribuida"

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
  // A regra de "não é operação viva" mora em `clientesForaDaOperacao`:
  // suspenso, encerrado e conta interna, num lugar só.
  const suspensos = await clientesForaDaOperacao()
  for (const h of (holdingsRes.data ?? []) as { id: string; name: string }[])
    holdingName.set(h.id, h.name)

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
      /**
       * Cliente fora da operação (suspenso, encerrado ou conta interna).
       *
       * Marcado AQUI e não cruzando por nome: a chave do agrupamento é o nome
       * da holding, e casar strings entre duas listas diferentes falha calado
       * quando uma delas não tem a loja (ex.: cliente só com loja inativa).
       */
      holdingFora: boolean
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
  const foraPorUnidade = new Map<string, boolean>()
  for (const l of linkedRaw) {
    if (!l.units) continue
    const hId = brandHolding.get(l.units.brand_id ?? "") ?? ""
    holdingPorUnidade.set(l.units.id, holdingName.get(hId) ?? "—")
    foraPorUnidade.set(l.units.id, suspensos.has(hId))
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
        holdingFora: foraPorUnidade.get(l.units.id) ?? false,
        unidadeInativa: l.units.active === false,
      }
    }
  }
  return { merchants, units, holdings, byMerchant }
}

/**
 * As lojas que o seletor do app distribuído oferece.
 *
 * Consulta PRÓPRIA, e não a de `getData()`, por causa de um detalhe que
 * importa: aquela filtra `active = true`, o que é certo pra tabela de
 * merchants — não se vincula loja nova a uma unidade morta — e errado aqui.
 * Loja suspensa é justamente o caso em que se quer testar uma autorização sem
 * risco: a Niterói, primeira loja escolhida pro teste, sumiu do seletor por
 * causa desse filtro.
 *
 * A rede de DEMONSTRAÇÃO continua fora: as lojas dela são fictícias e não
 * existe lojista pra autorizar — gerar código pra uma delas cria uma conexão
 * que nunca fecha.
 */
async function getUnidadesParaDistribuido(): Promise<
  { id: string; code: string; name: string; holdingName: string; inativa: boolean }[]
> {
  const { data } = await createAdminClient()
    .from("units")
    .select("id, code, name, active, brands!inner(holding_id, holdings!inner(name))")
    .order("code")

  return ((data ?? []) as unknown as {
    id: string
    code: string
    name: string
    active: boolean
    brands: { holding_id: string; holdings: { name: string } }
  }[])
    .filter((u) => u.brands?.holding_id !== HOLDING_DEMO_ID)
    .map((u) => ({
      id: u.id,
      code: u.code,
      name: u.name,
      holdingName: u.brands?.holdings?.name ?? "—",
      inativa: u.active === false,
    }))
}

/**
 * Conexões do app DISTRIBUÍDO — o caminho novo, em teste.
 *
 * Vem separado do resto porque não substitui nada: as lojas do centralizado
 * seguem em `unit_platforms.api_store_id` e não sabem que esta tabela existe.
 */
async function getConexoesDistribuidas(): Promise<ConexaoDist[]> {
  const { data } = await createAdminClient()
    .from("ifood_conexoes_distribuidas")
    .select(
      "id, user_code, verification_url, user_code_expira_em, status, merchant_id, erro, units(code, name), holdings(name)",
    )
    .order("criada_em", { ascending: false })
    .limit(50)

  return ((data ?? []) as unknown as {
    id: string
    user_code: string | null
    verification_url: string | null
    user_code_expira_em: string | null
    status: ConexaoDist["status"]
    merchant_id: string | null
    erro: string | null
    units: { code: string; name: string } | null
    holdings: { name: string } | null
  }[]).map((c) => ({
    id: c.id,
    unitLabel: c.units ? `#${c.units.code} ${c.units.name}` : "(sem loja)",
    holdingName: c.holdings?.name ?? "—",
    userCode: c.user_code,
    verificationUrl: c.verification_url,
    expiraEm: c.user_code_expira_em
      ? new Date(c.user_code_expira_em).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null,
    status: c.status,
    merchantId: c.merchant_id,
    erro: c.erro,
  }))
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
  const { donosDosMerchants } = await import("@/lib/ifood/dono-do-merchant")
  const { distribuidoConfigurado } = await import(
    "@/lib/ifood/auth-distribuido"
  )
  const [
    { merchants, units, holdings, byMerchant },
    solicitacoes,
    donoPorMerchant,
    sumidos,
    avisosFechados,
    conexoesDist,
    unidadesDist,
  ] = await Promise.all([
    getData(),
    getSolicitacoes(),
    donosDosMerchants(),
    merchantsSumidos(),
    getAvisosFechados(),
    getConexoesDistribuidas(),
    getUnidadesParaDistribuido(),
  ])
  /**
   * A contagem tem que bater com o que a lista MOSTRA.
   *
   * Ela dizia 88 enquanto a tela desenhava 61: o filtro de cliente fora da
   * operação (suspenso, encerrado, conta interna) rodava só na renderização.
   * Número que não bate com a lista logo abaixo é pior que número nenhum —
   * ensina a não confiar em nenhum dos dois.
   */
  const linkedCount = Object.values(byMerchant).filter(
    (v) => !v.holdingFora,
  ).length
  /* Arquivado E vinculado conta como CONECTADO, não como ignorado — a mesma
   * precedência que a tabela aplica. Contar aqui pelo carimbo e listar lá
   * pelo vínculo faria o badge dizer 3 com duas linhas na tela, que é o
   * defeito que esta contagem já teve uma vez ("dizia 88 e desenhava 61"). */
  const ignorados = merchants.filter(
    (m) => m.ignorado_em && !byMerchant[m.id],
  ).length
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

  /* Sem padding nem fundo próprios: estas abas nasceram como telas inteiras e
   * trouxeram o `p-6` junto quando viraram conteúdo do cartão de Conexões. No
   * desktop era só um quadrado cinza dentro do branco; no celular, 24px de cada
   * lado eram justamente o que faltava pro conteúdo caber. */
  return (
    <div className="flex flex-1 flex-col gap-6">
      {/* Volta pra Conexões de API, que é de onde se chega aqui hoje. Apontava
          pra tela de homologação — que era o caminho quando a integração ainda
          estava sendo homologada com o iFood, e virou um beco: quem clicava
          caía numa bateria de testes de endpoint sem entender por quê. */}

      {/* Empilhado no celular: os dois botões não encolhem, e lado a lado com
          o texto eles espremiam o parágrafo numa coluna de ~200px e ainda
          jogavam a página inteira pra fora da tela. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Store className="size-6 text-orange-500" />
            Lojas no iFood
          </h1>
          {/* O título dizia "Merchants iFood" e o texto citava o endpoint do
              cron. "Merchant" é palavra da API deles, não do trabalho — e o
              caminho do cron só diz algo pra quem escreveu o código. O que
              importa pra quem usa é o que acontece DEPOIS de vincular. */}
          <p className="mt-1 text-sm text-muted-foreground">
            Ligue cada loja à unidade dela na rede. Só depois disso o
            faturamento e as avaliações começam a entrar sozinhos, todo dia.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2 sm:shrink-0">
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
        donoPorMerchant={donoPorMerchant}
        compartilhadas={compartilhadas}
      />

      {/* Caminho NOVO, fechado por padrão. Ver a nota no componente: ele não
          pode competir com as três abas, que são o trabalho de todo dia. */}
      <ConexaoDistribuida
        unidades={(() => {
          // Quem já tem merchant vinculado no centralizado — vira a marca
          // "já conectada" na linha do seletor.
          const comMerchant = new Set(
            Object.values(byMerchant).map((v) => v.unitId),
          )
          return unidadesDist.map((u) => ({
            ...u,
            noCentralizado: comMerchant.has(u.id),
          }))
        })()}
        conexoes={conexoesDist}
        configurado={distribuidoConfigurado()}
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
