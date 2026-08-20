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

import { PlatformLogo } from "@/components/platform-logo"
import { createAdminClient } from "@/lib/supabase/admin"
import { clientesForaDaOperacao } from "@/lib/data/clientes-fora-da-operacao"
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
import { getCurrentHoldingId } from "@/lib/auth/permissions"

import { CatalogoButton } from "@/app/(app)/integracao/cardapioweb/_components/catalogo-button"
import { ClientesButton } from "@/app/(app)/integracao/cardapioweb/_components/clientes-button"
import { ConectarLoja } from "@/app/(app)/integracao/cardapioweb/_components/conectar-loja"
import { SyncButton } from "@/app/(app)/integracao/cardapioweb/_components/sync-button"
import { VinculoUnidade } from "@/app/(app)/integracao/cardapioweb/_components/vinculo-unidade"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

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
  /** Empresa DONA da instalação — define quais lojas podem ser vinculadas. */
  holding_id: string | null
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
  /** Total faturado — vem do agregado, sempre presente e barato. */
  total: number
  /**
   * O detalhamento (canais, pagamento, próprio × marketplace) só é buscado da
   * loja ABERTA: são as consultas caras, e com 500 lojas na tela elas seriam
   * 500 varreduras pra mostrar o que ninguém está olhando.
   */
  faturamento: FaturamentoAnalytics | null
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
async function carregar(
  lojaAberta: string | null,
  /** null = superadmin (vê a rede toda). Cliente SEMPRE recebe a própria. */
  holdingId: string | null,
) {
  const admin = createAdminClient()

  const [instRes, stRes] = await Promise.all([
    (() => {
      const q = admin
        .from("cardapioweb_installs")
        .select(
          "id, ambiente, auth_mode, merchant_id, merchant_name, active, inactive_reason, scopes, unit_id, holding_id, units(code, name)",
        )
      // Sem holding e sem ser superadmin = ninguém: prefiro devolver vazio a
      // devolver tudo. Falha aqui não pode virar vazamento.
      return holdingId ? q.eq("holding_id", holdingId) : q
    })()
      // Mais recente primeiro: quem acabou de conectar uma loja precisa vê-la
      // no topo, não embaixo do card antigo cheio de análise.
      .order("created_at", { ascending: false }),
    admin
      .from("cardapioweb_sync_state")
      .select(
        "install_id, backfill_cursor, backfill_concluido, ultimo_run_at, ultimo_erro, clientes_pagina, clientes_total, clientes_ultima_volta",
      ),
  ])

  /**
   * Fora da operação não entra: suspenso, encerrado e conta de demonstração.
   * Ver `clientesForaDaOperacao` — a regra mora num lugar só porque em três
   * dias três telas mostraram cliente que não devia estar ali.
   */
  const fora = await clientesForaDaOperacao()
  const installs = ((instRes.data ?? []) as unknown as InstallRow[]).filter(
    (i) => !i.holding_id || !fora.has(i.holding_id),
  )
  const states = (stRes.data ?? []) as StateRow[]
  const porInstall = new Map(states.map((s) => [s.install_id, s]))

  /**
   * UMA consulta agregada, não três por instalação.
   *
   * Antes isto era um N+1: pra cada install, dois `count` e um SELECT de TODAS
   * as linhas de pedidos pra somar o faturamento em JS. Com 11 lojas custa
   * 0,05s e ninguém percebe; com 500 seriam ~1.500 consultas e ~2 milhões de
   * linhas atravessando a rede pra virar uma soma — a mesma doença que
   * derrubou a tela de Início em 19/08.
   *
   * O detalhe pesado (clientes, produtos) continua sob demanda: só da loja que
   * o operador abrir. É o que mantém a tela leve com qualquer número de lojas.
   */
  const { data: resumo } = await admin.rpc("cardapioweb_resumo_installs")
  const porResumo = new Map(
    ((resumo ?? []) as {
      install_id: string
      pedidos: number
      detalhados: number
      faturamento: number
    }[]).map((r) => [r.install_id, r]),
  )

  const abertaId = installs.find((i) => i.id === lojaAberta)?.id
  const [clientesAberta, produtosAberta, fatAberta] = await Promise.all([
    abertaId ? getResumoClientes(abertaId) : Promise.resolve(null),
    abertaId ? getTopProdutos(abertaId) : Promise.resolve([]),
    abertaId ? getFaturamentoCardapioWeb(abertaId) : Promise.resolve(null),
  ])

  const stats: Stats[] = installs.map((i) => {
    const r = porResumo.get(i.id)
    return {
      installId: i.id,
      pedidos: Number(r?.pedidos ?? 0),
      detalhados: Number(r?.detalhados ?? 0),
      total: Number(r?.faturamento ?? 0),
      faturamento: i.id === abertaId ? fatAberta : null,
      clientes: i.id === abertaId ? clientesAberta : null,
      produtos: i.id === abertaId ? produtosAberta : [],
    }
  })
  const porStats = new Map(stats.map((s) => [s.installId, s]))

  return { installs, porInstall, porStats }
}

export async function AbaCardapioWeb({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; sandbox?: string; cw?: string }>
}) {
  const sp = await searchParams

  // CHEGOU PELO "INSTALAR" DA CW APP STORE → emenda direto no OAuth.
  //
  // O botão da App Store manda o lojista pra cá e para. Ele vê uma tela que
  // não pediu e precisa descobrir sozinho que falta clicar em "Conectar" —
  // então acha que instalou, sai, e do lado deles fica "não instalado". Foi
  // exatamente a reclamação que o Cardápio Web trouxe em 03/ago/26: quatro
  // lojas de clientes reais declararam usar a plataforma e NENHUMA conectou.
  //
  // A App Store não manda parâmetro nenhum na URL, então a pista é o Referer.
  // Não dá pra confiar nele pra segurança — mas aqui ele só decide se
  // adiantamos um clique, e o consentimento continua sendo dado no portal
  // deles. `?cw=manual` desarma, pra quem quiser ficar nesta tela.
  // O AMBIENTE SAI DO PRÓPRIO REFERER. Fixar "producao" mandava quem veio da
  // loja de sandbox pro portal de produção, onde ele não tem sessão — cai numa
  // tela de login que não explica nada. Quem vem de portal.sandbox volta pro
  // sandbox; o resto vai pra produção, que é o caso do lojista de verdade.
  const referer = (await headers()).get("referer") ?? ""
  const veioDaAppStore = referer.includes("cardapioweb.com")
  if (veioDaAppStore && sp.cw !== "manual") {
    const amb = referer.includes("sandbox") ? "sandbox" : "producao"
    redirect(`/api/cardapioweb/oauth/start?ambiente=${amb}`)
  }
  const [superadmin, minhaHolding] = await Promise.all([
    isSuperadmin(),
    getCurrentHoldingId(),
  ])

  // ESCOPO. A tela nasceu quando só existia a Cozina Foods, então buscava TODAS
  // as instalações com o client admin (que ignora RLS) e sem filtro de cliente
  // — qualquer cliente logado que abrisse aqui via a conexão dos outros. Ela
  // não está no menu, mas o link "acompanhe aqui" da faixa de sucesso leva
  // direto, e a URL é adivinhável.
  const { installs, porInstall, porStats } = await carregar(
    sp.loja ?? null,
    superadmin ? null : minhaHolding,
  )

  const unidades = await getVisibleUnits()
  // Opções do card "Conectar uma loja": são as MINHAS lojas, porque quem
  // conecta está conectando a própria.
  const opcoesUnidade = unidades
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, code: u.code, name: u.name }))

  // Opções de VÍNCULO por instalação: saem da empresa DA INSTALAÇÃO, não de
  // quem está olhando. Como superadmin, o seletor oferecia as lojas da Cozina
  // Foods pra uma instalação do joao nilson.
  //
  // Gravar errado NÃO era possível — vincularUnidadeAction já recusa unidade de
  // outra holding. Mas oferecer opção que a ação vai rejeitar é convidar pro
  // erro, e tinha um efeito pior: como a loja DELE não estava na lista, o
  // seletor não conseguia exibir o vínculo que já existia e mostrava "Sem
  // unidade" com o banco correto. A tela mentia sobre o próprio estado.
  /**
   * Nome do cliente de cada instalação — pro agrupamento.
   *
   * (Marcus, 20/08/26: "organize por cliente da mesma maneira da 99 e iFood".)
   * Sem isto a lista era uma pilha de cards por instalação: com 11 já custa
   * achar a loja de um cliente, e é a mesma pergunta que as outras duas telas
   * já respondem agrupando.
   */
  const holdingsDasInstalls = [
    ...new Set(installs.map((i) => i.holding_id).filter(Boolean)),
  ] as string[]
  const opcoesPorHolding = new Map<string, typeof opcoesUnidade>()
  const nomeDoCliente = new Map<string, string>()
  if (holdingsDasInstalls.length > 0) {
    const { data: hs } = await createAdminClient()
      .from("holdings")
      .select("id, name")
      .in("id", holdingsDasInstalls)
    for (const h of (hs ?? []) as { id: string; name: string }[])
      nomeDoCliente.set(h.id, h.name)
  }
  if (holdingsDasInstalls.length > 0) {
    const { data: us } = await createAdminClient()
      .from("units")
      .select("id, code, name, brands!inner(holding_id)")
      .in("brands.holding_id", holdingsDasInstalls)
      .eq("active", true)
    // O PostgREST tipa o join embutido como ARRAY, mesmo quando é 1-pra-1.
    for (const u of (us ?? []) as unknown as {
      id: string
      code: string
      name: string
      brands: { holding_id: string } | { holding_id: string }[]
    }[]) {
      const b = Array.isArray(u.brands) ? u.brands[0] : u.brands
      const h = b?.holding_id
      if (!h) continue
      opcoesPorHolding.set(h, [
        ...(opcoesPorHolding.get(h) ?? []),
        { id: u.id, code: u.code, name: u.name },
      ])
    }
  }
  const lojaAberta = sp.loja ?? null
  // Sandbox é ferramenta de quem constrói a integração, não de quem usa o
  // sistema. Some pro cliente; pra mim aparece com ?sandbox=1.
  const mostrarAmbiente = superadmin && sp.sandbox === "1"

  /**
   * MESMO PADRÃO DO iFOOD (Marcus, 20/08/26).
   *
   * O cabeçalho próprio saiu: a aba já diz onde você está, e "voltar para
   * importação" não faz mais sentido — a tela não é mais um beco, é uma aba
   * ao lado das outras.
   *
   * Aqui só existem "conectadas": no Cardápio Web não há fila de solicitação
   * (o lojista autoriza sozinho pelo link) nem merchant solto pra ignorar. A
   * régua de sub-abas com uma aba só seria enfeite, então fica a busca — que
   * é o que resolve com 11 instalações na tela.
   */
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <PlatformLogo platform="cardapioweb" size="md" />
          Lojas no Cardápio Web
        </h1>
      </div>
      <p className="text-sm text-muted-foreground">
        {/* Antes: "o histórico entra em lotes — o sync é retomável". Descreve
            como NÓS construímos, não o que o lojista precisa saber. */}
        Conecte a loja e os pedidos passam a entrar sozinhos. O histórico antigo
        vem aos poucos: pode fechar a página e continuar depois.
      </p>

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
        /* AGRUPADO POR CLIENTE, igual ao 99 e ao iFood. Fechado por padrão:
           com uma rede de 15 lojas aberta, o segundo cliente já nasce fora da
           tela. O resumo na linha diz o que tem dentro. */
        <div className="flex flex-col gap-3">
          {[
            ...new Map(
              installs.map((i) => [
                nomeDoCliente.get(i.holding_id ?? "") ?? "Sem cliente",
                true,
              ]),
            ).keys(),
          ].map((cliente) => {
            const doCliente = installs.filter(
              (i) =>
                (nomeDoCliente.get(i.holding_id ?? "") ?? "Sem cliente") ===
                cliente,
            )
            const pedidosDoCliente = doCliente.reduce(
              (a, i) => a + (porStats.get(i.id)?.pedidos ?? 0),
              0,
            )
            const temAberta = doCliente.some((i) => i.id === lojaAberta)
            return (
              <details
                key={cliente}
                // Abre sozinho quando a loja aberta é deste cliente: quem
                // clicou pra ver o detalhe não pode encontrar o bloco fechado.
                open={temAberta}
                className="group/cliente rounded-lg border bg-card"
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/cliente:rotate-90" />
                  <span className="font-semibold">{cliente}</span>
                  <span className="text-xs text-muted-foreground">
                    {doCliente.length} loja{doCliente.length > 1 ? "s" : ""}
                    {pedidosDoCliente > 0 &&
                      ` · ${fmtNum(pedidosDoCliente)} pedidos`}
                  </span>
                </summary>
                <div className="grid gap-6 border-t p-3">
          {doCliente.map((i) => {
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
                      {/* Como a loja autentica (OAuth ou chave) não muda nada
                          pra ninguém no dia a dia — nem pro lojista, nem pra
                          mim. Fica no bloco de detalhes técnicos, que só abre
                          quando alguém precisa falar com o suporte deles. */}
                      {!i.active && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                          inativa
                        </span>
                      )}
                    </div>

                    {i.ambiente === "sandbox" && (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                        Ambiente de teste — o faturamento desta loja NÃO entra
                        no Dashboard, no DRE nem nos relatórios da rede.
                      </p>
                    )}
                    <VinculoUnidade
                      installId={i.id}
                      unidades={
                        opcoesPorHolding.get(i.holding_id ?? "") ?? []
                      }
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
                {/* Um jeito só de ler, pro cliente e pra mim. O que era
                    exclusivo do superadmin (id da loja, selo OAuth, % de
                    detalhados, cursor do backfill) ou não muda decisão nenhuma
                    ou só importa quando está RUIM — então "Detalhados" aparece
                    apenas quando falta detalhe, e o resto foi pro bloco técnico. */}
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Metrica
                    label="Pedidos"
                    valor={fmtNum(s?.pedidos ?? 0)}
                    nota="já importados"
                  />
                  {pct < 100 && (s?.pedidos ?? 0) > 0 ? (
                    <Metrica
                      label="Sem detalhe"
                      valor={`${fmtNum((s?.pedidos ?? 0) - (s?.detalhados ?? 0))}`}
                      nota={`${100 - pct}% ainda sem itens`}
                    />
                  ) : (
                    <Metrica
                      label="Ticket médio"
                      valor={fmtBRL(
                        s && s.pedidos > 0 ? (s.total ?? 0) / s.pedidos : 0,
                      )}
                      nota="por pedido"
                    />
                  )}
                  <Metrica
                    label="Faturamento"
                    valor={fmtBRL(s?.total ?? 0)}
                    nota="do que já entrou"
                  />
                  <Metrica
                    label="Situação"
                    valor={st?.backfill_concluido ? "Em dia" : "Importando"}
                    nota={
                      st?.backfill_concluido
                        ? "todo o histórico já entrou"
                        : `histórico chegou até ${st?.backfill_cursor ?? "—"}`
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

                {/* Detalhes técnicos: o que só serve pra falar com o suporte
                    deles ou depurar. Fora daqui poluía a lista inteira com
                    informação que ninguém usa pra decidir nada. */}
                {superadmin && (
                  <p className="mt-4 text-[11px] text-muted-foreground">
                    Loja no Cardápio Web: <code className="font-mono">{i.merchant_id ?? "—"}</code>
                    {" · "}autenticação {i.auth_mode === "api_key" ? "por chave" : "OAuth"}
                    {i.scopes?.length ? ` · escopos: ${i.scopes.join(", ")}` : ""}
                  </p>
                )}

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
              </details>
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
