import Link from "next/link"
import { ArrowLeft, ArrowRight, Percent, Sigma } from "lucide-react"

import { ExportPdfButton } from "@/components/shared/export-pdf-button"
import { ProcedenciaDados } from "@/components/shared/procedencia-dados"
import { procedenciaDoRange } from "@/lib/data/procedencia"
import { LojaFilter } from "@/components/shared/loja-filter"
import { PeriodSelector } from "@/components/shared/period-selector"
import { ReportBrandLogo } from "@/components/report-brand-logo"
import { assertCanView } from "@/lib/auth/permissions"
import { getAccessibleUnitIds } from "@/lib/auth/roles"
import { getLojasCusto, type LojaCusto } from "@/lib/data/custo-itens"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import { getVisibleUnits } from "@/lib/data/units"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import { formatRangeLabel } from "@/lib/period"
import { readPeriod } from "@/lib/period-helpers"

/**
 * CMV da rede — o custo da mercadoria vendida que sai da Ficha Técnica.
 *
 * ── A REGRA QUE ORGANIZA A TELA INTEIRA ──────────────────────────────────
 * O CMV aqui é sempre sobre a RECEITA COBERTA (as linhas que têm custo
 * digitado), nunca sobre o faturamento do mês. Se fosse sobre o faturamento,
 * o número CAIRIA conforme a pessoa preenchesse menos — o incentivo exatamente
 * ao contrário do que a tela quer produzir.
 *
 * A consequência é que CMV sem cobertura não significa nada, e por isso os dois
 * andam juntos em todo lugar: no KPI, na linha da loja e na ordenação. Uma loja
 * com 12% de cobertura aparece com o CMV apagado e o aviso do lado, em vez de
 * entrar no ranking como se fosse comparável às outras.
 *
 * ── PONTO DE PARTIDA REALISTA (17/08/26) ─────────────────────────────────
 * Na base inteira havia 4 itens com custo preenchido. Então o estado vazio não
 * é detalhe: é o estado que quase todo mundo vai ver primeiro, e ele leva pra
 * Ficha Técnica em vez de mostrar uma tabela de traços.
 */

/**
 * Abaixo disso o CMV da loja é ruído, não indicador.
 *
 * Metade da receita é o piso porque é o que dá pra defender em voz alta: "o
 * custo de mais da metade do que essa loja vendeu". Com 22% mapeado, o CMV
 * responde por um quinto do cardápio e muda de cara a cada item novo.
 */
const COBERTURA_MINIMA = 0.5

/**
 * Loja cujo CMV ainda não significa nada.
 *
 * ⚠️ O segundo teste existe por causa de um caso REAL na base (17/08/26): a
 * Açaí House tinha UM item preenchido, com custo zero — que é um custo válido
 * (cortesia, ver migration 0215). O resultado era `custo ÷ receita = 0`, e a
 * tela ia anunciar "CMV 0,0% · saudável" e pôr a loja como a melhor da rede.
 * Custo total zero não é uma loja sem CMV, é uma loja sem cadastro.
 */
function cmvConfiavel(l: LojaCusto): boolean {
  return (
    l.cmvPct !== null && l.cobertura >= COBERTURA_MINIMA && l.custoMes > 0
  )
}

function faixaCmv(pct: number): {
  cor: string
  ponto: string
  rotulo: string
} {
  if (pct <= 0.3)
    return {
      cor: "text-emerald-700 dark:text-emerald-400",
      ponto: "bg-emerald-500",
      rotulo: "saudável",
    }
  if (pct <= 0.4)
    return {
      cor: "text-amber-700 dark:text-amber-400",
      ponto: "bg-amber-500",
      rotulo: "atenção",
    }
  return {
    cor: "text-rose-700 dark:text-rose-400",
    ponto: "bg-rose-500",
    rotulo: "alto",
  }
}

export default async function CmvPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; inicio?: string; fim?: string; lojas?: string }>
}) {
  const sp = await searchParams
  await assertCanView("relatorios")

  const { range: periodRange, year, month } = readPeriod(sp)

  const allUnits = (await getVisibleUnits())
    .filter((u) => u.active)
    .map((u) => ({
      id: u.id,
      code: u.code,
      name: u.name,
      city: u.city,
      logoUrl: u.logoUrl,
    }))
  const lojaCodes = (sp.lojas?.split(",") ?? []).filter(Boolean)
  const accessibleIds = await getAccessibleUnitIds()
  const scopedUnits =
    lojaCodes.length > 0
      ? allUnits.filter((u) => lojaCodes.includes(u.code))
      : accessibleIds === null
        ? allUnits
        : allUnits.filter((u) => accessibleIds.includes(u.id))

  const [lojas, periods] = await Promise.all([
    getLojasCusto(scopedUnits, year, month),
    getAvailablePeriods(),
  ])

  const comCusto = lojas.filter((l) => l.cmvPct !== null)
  const confiaveis = comCusto.filter(cmvConfiavel)
  const rasas = comCusto.filter((l) => !cmvConfiavel(l))

  // ⚠️ A cascata da rede soma SÓ as lojas confiáveis, não todas as que têm
  // algum custo. Uma loja com um item de custo zero cobrindo um terço da
  // receita entraria com R$ 4 mil no divisor e R$ 0 no dividendo — o CMV da
  // rede cairia por falta de cadastro e o gráfico anunciaria eficiência.
  const receitaCoberta = confiaveis.reduce((s, l) => s + l.receitaComCusto, 0)
  const custoTotal = confiaveis.reduce((s, l) => s + l.custoMes, 0)
  const taxaTotal = confiaveis.reduce((s, l) => s + l.taxaMes, 0)
  const lucroTotal = confiaveis.reduce((s, l) => s + (l.lucroMes ?? 0), 0)
  const cmvRede = receitaCoberta > 0 ? custoTotal / receitaCoberta : null

  // Cobertura da REDE: quanto da receita com item já tem custo. Aqui entra TODA
  // linha preenchida (inclusive as rasas) — é a medida de progresso do
  // cadastro, não da confiabilidade do CMV.
  const receitaItensTotal = lojas.reduce((s, l) => s + l.receitaItens, 0)
  const receitaPreenchida = comCusto.reduce(
    (s, l) => s + l.receitaComCusto,
    0,
  )
  const coberturaRede =
    receitaItensTotal > 0 ? receitaPreenchida / receitaItensTotal : 0

  // Ordena por CMV: quem mais come margem primeiro. As de cobertura rasa vão
  // pro fim independente do número — elas não competem no mesmo campeonato.
  const ordenadas = [
    ...confiaveis.sort((a, b) => (b.cmvPct ?? 0) - (a.cmvPct ?? 0)),
    ...rasas.sort((a, b) => (b.cmvPct ?? 0) - (a.cmvPct ?? 0)),
  ]
  const semNada = lojas.filter((l) => l.cmvPct === null && l.receitaItens > 0)

  /* De onde vem cada número — na tela e dentro do PDF. */
  const proc = await procedenciaDoRange(periodRange.start, periodRange.end, scopedUnits.map((u) => u.id))

  return (
    <div data-print="page" className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <ReportBrandLogo imgClassName="h-10 w-auto print:h-12" />
          <Link
            href="/relatorios"
            className="mb-1 inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            data-print="hide"
          >
            <ArrowLeft className="size-3.5" />
            Hub de Relatórios
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Percent className="size-6 text-primary" />
            CMV por loja
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Custo da mercadoria vendida sobre a receita já mapeada ·{" "}
            {formatRangeLabel(periodRange)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-print="hide">
          <ExportPdfButton
            aviso={{
              faltando: proc.comLacuna.map((p) => p.rotulo),
              linha: proc.linha,
            }}
          />
          <LojaFilter units={allUnits} />
          <PeriodSelector current={periodRange} options={periods} enableRange />
        </div>
      </div>

      <ProcedenciaDados p={proc} />

      {comCusto.length === 0 ? (
        <VazioTotal lojas={lojas} />
      ) : (
        <>
          {/* ── Cascata: onde o dinheiro vai ─────────────────────────────
              Só existe se alguma loja passou da régua. Desenhar a cascata com
              zeros seria pior que não desenhar: o dono leria "CMV 0%". */}
          {confiaveis.length === 0 ? (
            <QuaseLa lojas={comCusto.length} />
          ) : (
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold">
                De cada R$ 100 vendidos no que já está mapeado
              </p>
              <p className="text-xs text-muted-foreground">
                {comCusto.length}{" "}
                {comCusto.length === 1 ? "loja" : "lojas"} com custo lançado
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <Bloco
                titulo="Receita mapeada"
                valor={fmtBRL(receitaCoberta)}
                sub="base da conta"
              />
              <Bloco
                titulo="Taxas das plataformas"
                valor={`− ${fmtBRL(taxaTotal)}`}
                sub={
                  receitaCoberta > 0
                    ? fmtPct((taxaTotal / receitaCoberta) * 100)
                    : "—"
                }
                tom="rose"
              />
              <Bloco
                titulo="CMV"
                valor={`− ${fmtBRL(custoTotal)}`}
                sub={cmvRede !== null ? fmtPct(cmvRede * 100) : "—"}
                tom="rose"
              />
              <Bloco
                titulo="Lucro bruto"
                valor={fmtBRL(lucroTotal)}
                sub={
                  receitaCoberta > 0
                    ? fmtPct((lucroTotal / receitaCoberta) * 100)
                    : "—"
                }
                tom="emerald"
              />
            </div>

            {/* A barra é a cascata desenhada: mesma ordem, mesma proporção. */}
            {receitaCoberta > 0 && (
              <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="bg-rose-400"
                  style={{ width: `${(taxaTotal / receitaCoberta) * 100}%` }}
                  title={`Taxas ${fmtPct((taxaTotal / receitaCoberta) * 100)}`}
                />
                <div
                  className="bg-amber-400"
                  style={{ width: `${(custoTotal / receitaCoberta) * 100}%` }}
                  title={`CMV ${fmtPct((custoTotal / receitaCoberta) * 100)}`}
                />
                <div
                  className="bg-emerald-500"
                  style={{
                    width: `${Math.max(0, (lucroTotal / receitaCoberta) * 100)}%`,
                  }}
                  title={`Lucro ${fmtPct((lucroTotal / receitaCoberta) * 100)}`}
                />
              </div>
            )}
          </div>
          )}

          {/* ── O aviso que sustenta o número acima ────────────────────── */}
          <AvisoCobertura
            coberturaRede={coberturaRede}
            receitaCoberta={receitaPreenchida}
            receitaItensTotal={receitaItensTotal}
            rasas={rasas.length}
            semNada={semNada.length}
          />

          {/* ── Tabela por loja ────────────────────────────────────────── */}
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center gap-2 border-b px-5 py-3">
              <Sigma className="size-4 text-primary" />
              <p className="text-sm font-semibold">CMV por loja</p>
              <span className="text-[11px] text-muted-foreground">
                maior CMV primeiro
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 text-left font-semibold">Loja</th>
                    <th className="px-4 py-2 text-right font-semibold">
                      Receita mapeada
                    </th>
                    <th className="px-4 py-2 text-right font-semibold">CMV</th>
                    <th className="px-4 py-2 text-right font-semibold">CMV %</th>
                    <th className="px-4 py-2 text-right font-semibold">
                      Taxas %
                    </th>
                    <th className="px-4 py-2 text-right font-semibold">
                      Margem %
                    </th>
                    <th className="px-4 py-2 text-right font-semibold">
                      Cobertura
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ordenadas.map((l) => (
                    <LinhaLoja key={l.unitId} l={l} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {semNada.length > 0 && (
            <div className="rounded-xl border border-dashed bg-card px-5 py-4">
              <p className="text-sm font-medium">
                {semNada.length}{" "}
                {semNada.length === 1
                  ? "loja vendeu e ainda não tem"
                  : "lojas venderam e ainda não têm"}{" "}
                nenhum custo lançado
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {semNada
                  .slice(0, 8)
                  .map((l) => l.nome)
                  .join(" · ")}
                {semNada.length > 8 && ` · +${semNada.length - 8}`}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Bloco({
  titulo,
  valor,
  sub,
  tom,
}: {
  titulo: string
  valor: string
  sub: string
  tom?: "rose" | "emerald"
}) {
  const cor =
    tom === "rose"
      ? "text-rose-700 dark:text-rose-400"
      : tom === "emerald"
        ? "text-emerald-700 dark:text-emerald-400"
        : ""
  return (
    <div className="rounded-lg border bg-background px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {titulo}
      </p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${cor}`}>{valor}</p>
      <p className="text-[11px] tabular-nums text-muted-foreground">{sub}</p>
    </div>
  )
}

function LinhaLoja({ l }: { l: LojaCusto }) {
  const confiavel = cmvConfiavel(l)
  const f = faixaCmv(l.cmvPct ?? 0)
  const taxaPct = l.receitaComCusto > 0 ? l.taxaMes / l.receitaComCusto : 0
  // Sem custo nenhum em R$, "0,0%" seria uma afirmação falsa sobre a loja.
  const semCustoReal = l.custoMes <= 0

  return (
    <tr className={confiavel ? undefined : "opacity-55"}>
      <td className="px-4 py-2.5">
        <Link
          href={`/ficha-tecnica/${l.codigo}`}
          className="group inline-flex items-center gap-1.5 font-medium hover:text-primary"
        >
          {l.nome}
          <ArrowRight
            className="size-3 opacity-0 transition-opacity group-hover:opacity-100"
            data-print="hide"
          />
        </Link>
        {l.cidade && (
          <p className="text-[11px] text-muted-foreground">{l.cidade}</p>
        )}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">
        {fmtBRL(l.receitaComCusto)}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">
        {fmtBRL(l.custoMes)}
      </td>
      <td className="px-4 py-2.5 text-right">
        {semCustoReal ? (
          <span
            className="text-muted-foreground"
            title="Os itens preenchidos estão com custo zero — não dá pra apurar CMV"
          >
            —
          </span>
        ) : (
          <span
            className={`inline-flex items-center gap-1.5 font-semibold tabular-nums ${confiavel ? f.cor : ""}`}
          >
            {confiavel && <span className={`size-1.5 rounded-full ${f.ponto}`} />}
            {fmtPct((l.cmvPct ?? 0) * 100)}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
        {fmtPct(taxaPct * 100)}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">
        {l.lucroPct !== null ? fmtPct(l.lucroPct * 100) : "—"}
      </td>
      <td className="px-4 py-2.5 text-right">
        <span className="tabular-nums">{fmtPct(l.cobertura * 100)}</span>
        <span className="block text-[10px] text-muted-foreground">
          {fmtNum(l.itensComCusto)}/{fmtNum(l.itens)} itens
        </span>
      </td>
    </tr>
  )
}

/**
 * O aviso não é decoração: sem ele o CMV da rede é um número solto. Ele diz
 * sobre QUANTO da receita a conta foi feita, quantas lojas estão rasas demais
 * pra entrar, e leva pro lugar onde se resolve.
 */
function AvisoCobertura({
  coberturaRede,
  receitaCoberta,
  receitaItensTotal,
  rasas,
  semNada,
}: {
  coberturaRede: number
  receitaCoberta: number
  receitaItensTotal: number
  rasas: number
  semNada: number
}) {
  const bom = coberturaRede >= 0.7
  return (
    <div
      className={
        bom
          ? "rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-900/40 dark:bg-emerald-950/30"
          : "rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-900/40 dark:bg-amber-950/30"
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className={`text-lg font-bold tabular-nums ${bom ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}
        >
          {fmtPct(coberturaRede * 100)}
        </span>
        <span
          className={`text-sm ${bom ? "text-emerald-800 dark:text-emerald-300" : "text-amber-800 dark:text-amber-300"}`}
        >
          da receita com relatório de item já tem custo digitado —{" "}
          {fmtBRL(receitaCoberta)} de {fmtBRL(receitaItensTotal)}.
        </span>
      </div>
      <p
        className={`mt-1 text-xs ${bom ? "text-emerald-800/80 dark:text-emerald-300/80" : "text-amber-800/80 dark:text-amber-300/80"}`}
      >
        {rasas > 0 && (
          <>
            {rasas} {rasas === 1 ? "loja aparece" : "lojas aparecem"} esmaecida
            {rasas === 1 ? "" : "s"}: {rasas === 1 ? "tem" : "têm"} menos de{" "}
            {fmtPct(COBERTURA_MINIMA * 100)} da receita mapeada, ou só itens de
            custo zero — nos dois casos o CMV ainda não representa a operação.{" "}
          </>
        )}
        {semNada > 0 && (
          <>
            {semNada} {semNada === 1 ? "loja" : "lojas"} sem nenhum custo{" "}
            {semNada === 1 ? "ficou" : "ficaram"} fora da conta.{" "}
          </>
        )}
        O custo é digitado na{" "}
        <Link href="/ficha-tecnica" className="font-medium underline">
          Ficha Técnica
        </Link>
        , item por item.
      </p>
    </div>
  )
}

/**
 * Já tem custo, mas nenhuma loja passou da régua. É o estado real da base em
 * 17/08/26 — e ele merece uma tela própria porque é encorajador e acionável,
 * enquanto uma cascata zerada seria só errada.
 */
function QuaseLa({ lojas }: { lojas: number }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-900/40 dark:bg-amber-950/30">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">
        O preenchimento começou, mas ainda não dá pra apurar CMV
      </p>
      <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-300/80">
        {lojas === 1 ? "Uma loja já tem" : `${lojas} lojas já têm`} custo
        lançado, mas nenhuma chegou a{" "}
        {fmtPct(COBERTURA_MINIMA * 100)} da receita mapeada com custo maior que
        zero. Enquanto isso não acontece, o resumo da rede fica de fora — um CMV
        apurado sobre um quinto do cardápio diria mais sobre o que falta
        preencher do que sobre a operação. A tabela abaixo mostra onde cada loja
        está.
      </p>
    </div>
  )
}

/**
 * O estado vazio — que é o que praticamente todo cliente vê primeiro.
 *
 * ⚠️ Ele NÃO é só um cartaz. Quem abre um relatório de CMV chegou disposto a
 * olhar custo; mandar a pessoa "ir na Ficha Técnica" e deixá-la escolher por
 * onde começar entre treze lojas desperdiça exatamente esse momento. Então o
 * vazio lista as lojas com mais receita já mapeada, com link direto — a fila de
 * trabalho, na ordem em que ela paga.
 */
function VazioTotal({ lojas }: { lojas: LojaCusto[] }) {
  const fila = lojas.filter((l) => l.itens > 0).slice(0, 6)

  return (
    <div className="rounded-xl border border-dashed bg-card p-8">
      <div className="text-center">
        <Percent className="mx-auto size-8 text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium">
          Nenhum custo lançado neste período
        </p>
        <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
          O CMV sai do custo que a operação digita na Ficha Técnica, na linha de
          cada item vendido. Você não precisa preencher tudo: os 20 itens de
          maior receita costumam cobrir ~90% da venda da loja.
        </p>
      </div>

      {fila.length > 0 && (
        <div className="mx-auto mt-6 max-w-xl">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Por onde começar — maior faturamento primeiro
          </p>
          <div className="divide-y rounded-lg border bg-background">
            {fila.map((l) => (
              <Link
                key={l.unitId}
                href={`/ficha-tecnica/${l.codigo}`}
                className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted"
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {l.nome}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {fmtNum(l.itens)} itens
                </span>
                <span className="w-24 shrink-0 text-right tabular-nums">
                  {fmtBRL(l.receitaMes)}
                </span>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 text-center">
        <Link
          href="/ficha-tecnica"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground"
        >
          Ver todas na Ficha Técnica
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  )
}
