import Link from "next/link"
import {
  AlertTriangle,
  LayoutDashboard,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react"

import { assertCanView } from "@/lib/auth/permissions"
import { visaoDaCarteira } from "@/lib/data/carteira-visao"
import { fmtBRL, fmtNum } from "@/lib/format"
import type { GestorOpcao, LojaNoTopo, PontoMes } from "@/lib/data/carteira-visao"
import { formatRangeLabel } from "@/lib/period"
import { readPeriod } from "@/lib/period-helpers"
import { PeriodSelector } from "@/components/shared/period-selector"
import { TourButton } from "@/components/onboarding/tour-button"
import { TOUR_CARTEIRA } from "../_tours"

export const metadata = { title: "Visão da carteira · Delivery OS" }

/** 75 dias vira "2 meses e 15 dias". */
function tempo(dias: number): string {
  if (dias < 30) return `${dias} dia${dias === 1 ? "" : "s"}`
  const m = Math.floor(dias / 30)
  const d = dias - m * 30
  const base = `${m} ${m === 1 ? "mês" : "meses"}`
  return d === 0 ? base : `${base} e ${d}d`
}

export default async function VisaoPage({
  searchParams,
}: {
  searchParams: Promise<{
    periodo?: string
    inicio?: string
    fim?: string
    gestor?: string
  }>
}) {
  const sp = await searchParams
  await assertCanView("unidades")
  const { range } = readPeriod(sp)
  const v = await visaoDaCarteira(range, sp.gestor ?? null)
  const periodo = formatRangeLabel(range)

  if (!v) return null

  return (
    <div className="flex flex-1 flex-col gap-4 bg-muted/30 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <LayoutDashboard className="size-6 text-muted-foreground" />
            Visão da carteira
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Como a carteira está hoje, antes de olhar loja por loja.
          </p>
          {/* O tour daqui explica o PAINEL INTEIRO, não só esta tela: é a
              porta de entrada da seção, e quem chega precisa entender a
              ordem (vende → alinha → entrega ao gestor → trabalha → cobra)
              antes de entender qualquer tela isolada. */}
          <div className="mt-2">
            <TourButton steps={TOUR_CARTEIRA} label="Como funciona o painel" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FiltroGestor
            gestores={v?.gestores ?? []}
            atual={sp.gestor ?? ""}
            sp={sp}
          />
          <PeriodSelector current={range} />
        </div>
      </div>

      {sp.gestor && (
        <p className="-mb-1 text-xs text-muted-foreground">
          Mostrando só a carteira{" "}
          {sp.gestor === "sem"
            ? "sem gestor"
            : `de ${v.gestores.find((g) => g.id === sp.gestor)?.nome ?? "—"}`}
          {v.foraDoFiltro > 0 && ` · ${v.foraDoFiltro} loja(s) ativas fora do filtro`}
        </p>
      )}

      {/* ── 1. O DINHEIRO DA AGÊNCIA ────────────────────────────────────
          Vem PRIMEIRO de propósito. As outras telas respondem sobre a
          operação do cliente; quem abre esta é o dono da agência, e a
          primeira pergunta dele é sobre o dinheiro dele. */}
      <Secao titulo="A agência" />
      <div data-tour="visao-agencia" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          rotulo="Receita recorrente (MRR)"
          valor={fmtBRL(v.mrr)}
          nota={
            v.lojasSemMensalidade > 0
              ? `${v.lojasSemMensalidade} loja(s) sem mensalidade cadastrada`
              : "soma das mensalidades ativas"
          }
          alerta={v.lojasSemMensalidade > 0}
          destaque
        />
        <Kpi
          rotulo={`Recebido · ${periodo}`}
          valor={fmtBRL(v.recebido)}
          nota={`${fmtBRL(v.aReceber)} a vencer`}
        />
        <Kpi
          rotulo="Atrasado"
          valor={fmtBRL(v.atrasado)}
          nota={v.atrasado > 0 ? "venceu e não entrou" : "nada vencido"}
          alerta={v.atrasado > 0}
        />
        <div
          className={`flex flex-col gap-0.5 rounded-xl border px-4 py-3 ${
            v.sobra > 0
              ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20"
              : v.sobra < 0
                ? "border-rose-300 bg-rose-50/50 dark:border-rose-900 dark:bg-rose-950/20"
                : ""
          }`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Sobra do período
          </span>
          <span className="text-xl font-semibold tabular-nums">
            {fmtBRL(v.sobra)}
          </span>
          <span className="text-[11px] text-muted-foreground">
            recebido − {fmtBRL(v.despesasPagas)} de despesas
          </span>
        </div>
      </div>

      {/* ── 2. A CARTEIRA, COM COMPARAÇÃO ────────────────────────────────
          Número sem comparação não é informação: R$ 1,1 milhão é bom ou
          ruim? Só o mês anterior responde. */}
      <Secao titulo="A carteira que ela administra" />
      <div data-tour="visao-carteira" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          rotulo={`Faturamento · ${periodo}`}
          valor={fmtBRL(v.faturamento)}
          variacao={variacao(v.faturamento, v.faturamentoAnterior)}
          nota={`antes: ${fmtBRL(v.faturamentoAnterior)}`}
          destaque
        />
        <Kpi
          rotulo="Pedidos"
          valor={fmtNum(v.pedidos)}
          variacao={variacao(v.pedidos, v.pedidosAnterior)}
          nota={`antes: ${fmtNum(v.pedidosAnterior)}`}
        />
        <Kpi
          rotulo="Ticket médio"
          valor={fmtBRL(v.ticket)}
          nota={`${v.lojasComDado} loja(s) com dado`}
        />
        <Kpi
          rotulo="Média por loja"
          valor={fmtBRL(v.mediaPorLoja)}
          /* Dividido pelas lojas COM DADO, não pelo total: incluir as sem
             importação afundaria a média com zeros que não são vendas. */
          nota="base: só as com dado"
        />
      </div>

      {/* ── 3. MOVIMENTO ────────────────────────────────────────────────── */}
      <Secao titulo="Movimento" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          rotulo="Lojas ativas"
          valor={`${v.lojasAtivas}/${v.lojasTotal}`}
          nota={
            v.lojasTotal - v.lojasAtivas > 0
              ? `${v.lojasTotal - v.lojasAtivas} inativa(s)`
              : "todas ativas"
          }
        />
        <Kpi
          rotulo="No onboarding"
          valor={fmtNum(v.emOnboarding)}
          nota={
            v.lojasNovas30 > 0
              ? `${v.lojasNovas30} entraram nos últimos 30 dias`
              : "ninguém entrou nos últimos 30 dias"
          }
        />
        <Kpi
          rotulo="Paradas"
          valor={fmtNum(v.lojasParadas)}
          nota={v.lojasParadas > 0 ? "sem vender no período" : "todas vendendo"}
          alerta={v.lojasParadas > 0}
        />
        <Kpi
          rotulo="Permanência média"
          valor={v.permanenciaMedia === null ? "—" : tempo(v.permanenciaMedia)}
          nota={
            v.permanenciaMedia === null
              ? "sem data de entrada"
              : "tempo em gestão"
          }
          alerta={v.permanenciaMedia === null}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloco titulo="Metas de 30 dias" icone={<Target className="size-4" />}>
          {v.metasComValor === 0 ? (
            /* O texto antigo dizia "é preenchida na aba Carteira de cada
               loja" e o Marcus não achou. Instrução sem caminho é instrução
               que ninguém segue — agora vai o link. */
            <div className="flex flex-col gap-1.5">
              <p className="text-sm text-muted-foreground">
                Nenhuma loja com meta definida.
              </p>
              <Link
                href="/carteira/lojas"
                className="text-xs font-medium text-primary underline-offset-2 hover:underline"
              >
                Abrir a lista de lojas → escolher a loja → aba Carteira
              </Link>
            </div>
          ) : (
            <>
              <p className="text-3xl font-semibold tabular-nums">
                {v.metasBatidas}
                <span className="text-lg text-muted-foreground">
                  /{v.metasComValor}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                bateram a meta nos últimos 30 dias
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-emerald-500"
                  style={{
                    width: `${(v.metasBatidas / v.metasComValor) * 100}%`,
                  }}
                />
              </div>
            </>
          )}
        </Bloco>

        <Bloco
          titulo={`Semana de ${new Date(`${v.semanaAtual}T12:00:00Z`).toLocaleDateString("pt-BR")}`}
          icone={<AlertTriangle className="size-4" />}
        >
          <p className="text-3xl font-semibold tabular-nums">
            {fmtNum(v.semanasPendentes)}
          </p>
          <p className="text-xs text-muted-foreground">
            loja(s) ativa(s) sem comentário escrito nesta semana
          </p>
          {v.semanasVencendoHoje > 0 && (
            <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              Hoje é quarta — {v.semanasVencendoHoje} vencem hoje.
            </p>
          )}
        </Bloco>
      </div>

      <div data-tour="visao-concentracao" className="grid gap-4 lg:grid-cols-2">
        <Evolucao serie={v.serie} />
        <Concentracao top={v.topLojas} pct={v.concentracaoTop5} />
      </div>

      <div data-tour="visao-atencao" className="rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <TrendingDown className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Precisa de atenção</h2>
          {v.alertas.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
              {v.alertas.length}
            </span>
          )}
        </div>
        {v.alertas.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhuma loja em alerta. Sem queda acima de 15%, sem loja parada.
          </p>
        ) : (
          <ul className="divide-y">
            {v.alertas.map((a) => (
              <li key={`${a.unitId}-${a.motivo}`}>
                <Link
                  href={`/unidades/${encodeURIComponent(a.code)}`}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-muted/50"
                >
                  {a.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.logoUrl}
                      alt=""
                      className="size-7 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-[10px] font-semibold text-muted-foreground">
                      {a.code}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {a.nome}
                  </span>
                  {/* O valor ao lado do percentual: "caiu 26%" não diz se são
                      R$ 300 ou R$ 80 mil, e é o valor que decide qual loja se
                      atende primeiro. */}
                  {a.de !== null && (
                    <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:block">
                      {fmtBRL(a.de)} → {fmtBRL(a.para ?? 0)}
                    </span>
                  )}
                  <span className="shrink-0 text-xs font-medium text-amber-700 dark:text-amber-400">
                    {a.motivo}
                    {a.de !== null && a.para !== null && (
                      <span className="ml-1 font-normal">
                        (−{fmtBRL(a.de - a.para)})
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** `null` quando não há base de comparação — 0 → 10 não é "+∞%". */
function variacao(atual: number, antes: number): number | null {
  if (antes <= 0) return null
  return ((atual - antes) / antes) * 100
}

function Kpi({
  rotulo,
  valor,
  nota,
  variacao: v,
  destaque,
  alerta,
}: {
  rotulo: string
  valor: string
  nota: string
  variacao?: number | null
  destaque?: boolean
  alerta?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border bg-card px-4 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {rotulo}
      </span>
      <span className="flex items-baseline gap-2">
        <span
          className={`tabular-nums font-semibold ${destaque ? "text-xl" : "text-lg"}`}
        >
          {valor}
        </span>
        {v !== null && v !== undefined && (
          <span
            className={`flex items-center gap-0.5 text-[11px] font-medium tabular-nums ${
              v >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {v >= 0 ? (
              <TrendingUp className="size-3" />
            ) : (
              <TrendingDown className="size-3" />
            )}
            {Math.abs(v).toFixed(1)}%
          </span>
        )}
      </span>
      <span
        className={`text-[11px] ${alerta ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}
      >
        {nota}
      </span>
    </div>
  )
}

function Secao({ titulo }: { titulo: string }) {
  return (
    <h2 className="-mb-1 mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {titulo}
    </h2>
  )
}

/**
 * Seis meses de faturamento da carteira.
 *
 * Barra proporcional ao MAIOR mês, e o valor só no topo do maior: seis
 * rótulos de moeda lado a lado viram uma parede de números que ninguém lê.
 */
function Evolucao({ serie }: { serie: PontoMes[] }) {
  const maior = Math.max(...serie.map((p) => p.faturamento), 0)
  if (maior <= 0) return null
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-semibold">
          Faturamento da carteira · 6 meses
        </h2>
        {serie.some((p) => p.parcial) && (
          <span className="text-[11px] text-muted-foreground">
            * mês em curso, ainda incompleto
          </span>
        )}
      </div>
      <div className="flex h-36 items-end gap-2">
        {serie.map((p, i) => (
          <div
            key={p.rotulo + i}
            className="group flex h-full flex-1 flex-col items-center gap-1"
            title={`${p.rotulo}${p.parcial ? " (mês em curso)" : ""}: ${fmtBRL(p.faturamento)} · ${fmtNum(p.pedidos)} pedidos`}
          >
            <span className="h-3 text-[9px] font-medium tabular-nums text-muted-foreground">
              {p.faturamento === maior ? fmtBRL(p.faturamento) : ""}
            </span>
            {/* Altura em % precisa de pai com altura resolvida — este flex-1
                dentro do h-36 dá isso. */}
            <div className="flex w-full flex-1 items-end">
              <div
                /* Mês em curso listrado: a barra menor não é queda, é mês
                   pela metade — e barra sólida ao lado de meses fechados
                   convida exatamente à leitura errada. */
                className={`w-full rounded-t transition-colors group-hover:bg-primary ${
                  p.parcial
                    ? "bg-[repeating-linear-gradient(45deg,var(--color-primary)_0_6px,transparent_6px_12px)] opacity-70"
                    : "bg-primary/75"
                }`}
                style={{ height: `${(p.faturamento / maior) * 100}%` }}
              />
            </div>
            <span className="text-[9px] text-muted-foreground">
              {p.rotulo}
              {p.parcial && "*"}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Concentração da carteira.
 *
 * A pergunta de risco que ninguém faz até a maior loja sair: quanto do
 * faturamento depende das cinco maiores? Acima de 60% a agência não tem uma
 * carteira, tem cinco clientes e um monte de acompanhantes.
 */
function Concentracao({
  top,
  pct,
}: {
  top: LojaNoTopo[]
  pct: number
}) {
  if (top.length === 0) return null
  const risco = pct >= 60
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-semibold">Concentração</h2>
        <span
          className={`text-xs font-medium tabular-nums ${
            risco ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"
          }`}
        >
          as {top.length} maiores são {pct.toFixed(0)}% do faturamento
        </span>
        {risco && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
            risco
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {top.map((l) => (
          <div key={l.code} className="flex items-center gap-2.5">
            {l.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={l.logoUrl} alt="" className="size-6 shrink-0 rounded object-cover" />
            ) : (
              <span className="grid size-6 shrink-0 place-items-center rounded bg-muted text-[9px] font-semibold text-muted-foreground">
                {l.code}
              </span>
            )}
            <span className="w-36 shrink-0 truncate text-xs">{l.nome}</span>
            <div className="h-3 flex-1 overflow-hidden rounded bg-muted">
              <div
                className="h-full rounded bg-primary/70"
                style={{ width: `${(l.valor / top[0].valor) * 100}%` }}
              />
            </div>
            <span className="w-11 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
              {l.fatia.toFixed(0)}%
            </span>
            <span className="w-24 shrink-0 text-right text-xs font-medium tabular-nums">
              {fmtBRL(l.valor)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Bloco({
  titulo,
  icone,
  children,
}: {
  titulo: string
  icone: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        {icone}
        <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
      </div>
      {children}
    </div>
  )
}

/**
 * Filtro de gestor.
 *
 * Link e não `<select>` com JS: a página é Server Component e o filtro tem
 * que sobreviver a um F5 e a um link colado no WhatsApp — que é como a
 * agência manda "olha a carteira do William" pra outra pessoa.
 */
function FiltroGestor({
  gestores,
  atual,
  sp,
}: {
  gestores: GestorOpcao[]
  atual: string
  sp: Record<string, string | undefined>
}) {
  if (gestores.length === 0) return null
  const base = new URLSearchParams()
  for (const k of ["periodo", "inicio", "fim"]) {
    if (sp[k]) base.set(k, sp[k]!)
  }
  const href = (g: string) => {
    const p = new URLSearchParams(base)
    if (g) p.set("gestor", g)
    const q = p.toString()
    return `/carteira/visao${q ? `?${q}` : ""}`
  }
  const opcoes = [
    { id: "", nome: "Todos os gestores" },
    ...gestores,
    { id: "sem", nome: "Sem gestor" },
  ]
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
      {opcoes.map((o) => (
        <Link
          key={o.id}
          href={href(o.id)}
          className={`rounded-md px-2 py-1 text-xs transition-colors ${
            atual === o.id
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted"
          }`}
        >
          {o.nome}
        </Link>
      ))}
    </div>
  )
}
