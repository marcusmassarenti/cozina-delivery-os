import { CalendarDays, TriangleAlert } from "lucide-react"
import Link from "next/link"

import { assertCanView } from "@/lib/auth/permissions"
import { getAccessibleUnitIds } from "@/lib/auth/roles"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  getVendasPorDiaSemana,
  getVendasPorDiaSemanaPorLoja,
} from "@/lib/data/dia-semana"
import { BrandLogo } from "@/components/brand-logo"
import type { PlatformId } from "@/lib/data/dia-semana"
import { PLATAFORMAS } from "@/components/platform-logo"
import { PlataformaSelector } from "./_components/plataforma-selector"
import { MapaCalor } from "./_components/mapa-calor"
import { PeriodoSelector } from "./_components/periodo-selector"
import { DiaSemanaCard } from "@/components/shared/dia-semana-card"
import { ExportPdfButton } from "@/components/shared/export-pdf-button"
import { fmtBRL, fmtBRLShort, fmtNum } from "@/lib/format"

/**
 * Desempenho por dia da semana, na rede e loja a loja.
 *
 * O card da unidade responde "qual dia esta loja vende menos". Aqui a
 * pergunta é outra e só existe junto: QUAL LOJA foge do padrão da rede.
 *
 * Se todo mundo cai na terça, é mercado — não há o que fazer além de ajustar
 * escala. Se UMA loja cai no sábado enquanto as outras picam, é operação dela:
 * fechou, faltou gente, ficou sem entregador. Essa distinção é a razão do
 * relatório existir, e nenhuma tela de loja individual consegue mostrá-la.
 */
export default async function RelatorioDiaSemanaPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; plataforma?: string }>
}) {
  await assertCanView("relatorios")
  const sp = await searchParams

  // Padrão: últimos 90 dias. Menos que isso e cada dia da semana tem ~4
  // amostras — uma chuva de sábado já vira "padrão".
  const hoje = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const periodo = sp.periodo ?? "90d"

  // Últimos 6 meses FECHADOS (o corrente fica de fora: meio mês não fecha
  // semana e a comparação sairia torta).
  const mesesFechados = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - 1 - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  })

  const mDias = periodo.match(/^(\d+)d$/)
  const mMes = periodo.match(/^(\d{4})-(\d{2})$/)
  let de: string
  let ate: string
  if (mMes) {
    const ano = Number(mMes[1])
    const mes = Number(mMes[2])
    de = `${mMes[1]}-${mMes[2]}-01`
    ate = iso(new Date(ano, mes, 0))
  } else {
    const n = mDias ? Number(mDias[1]) : 90
    ate = iso(hoje)
    de = iso(new Date(hoje.getTime() - n * 24 * 60 * 60 * 1000))
  }
  const poucaAmostra = !!mMes

  const admin = createAdminClient()
  const allowed = await getAccessibleUnitIds()
  let q = admin
    .from("units")
    .select("id, code, name, logo_url")
    .eq("active", true)
    .order("name")
  if (allowed !== null) {
    if (allowed.length === 0) return <Vazio />
    q = q.in("id", allowed)
  }
  const { data: units } = await q
  const lojas = units ?? []
  const ids = lojas.map((u) => u.id)

  // Plataforma vinda da URL, validada contra a lista — querystring é entrada
  // do usuário e vai direto pro filtro do RPC.
  const VALIDAS: PlatformId[] = PLATAFORMAS
  const plataforma = VALIDAS.includes(sp.plataforma as PlatformId)
    ? (sp.plataforma as PlatformId)
    : null
  const filtro = plataforma ? [plataforma] : null

  const rede = await getVendasPorDiaSemana(ids, de, ate, filtro)
  if (!rede.melhor) return <Vazio plataforma={plataforma} />

  // Participação de cada dia no faturamento da REDE — é a régua contra a qual
  // cada loja é comparada.
  const shareRede = new Map<number, number>()
  if (rede.total > 0) {
    for (const d of rede.dias) {
      shareRede.set(d.dow, (d.valor / rede.total) * 100)
    }
  }
  const porLoja = await getVendasPorDiaSemanaPorLoja(
    ids,
    de,
    ate,
    shareRede,
    filtro,
  )

  const linhas = lojas
    .map((u) => ({ unit: u, d: porLoja.get(u.id) }))
    .filter((l): l is { unit: (typeof lojas)[number]; d: NonNullable<ReturnType<typeof porLoja.get>> } => !!l.d)
    .sort((a, b) => b.d.amplitudePct - a.d.amplitudePct)

  const foraDoPadrao = linhas.filter((l) => l.d.foraDoPadrao)

  return (
    <div data-print="page" className="flex flex-1 flex-col gap-5 bg-muted/30 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarDays className="size-5 text-muted-foreground" />
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            Desempenho por dia da semana
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {de.split("-").reverse().join("/")} a{" "}
            {ate.split("-").reverse().join("/")} · {linhas.length} lojas com
            venda no período
          </p>
        </div>
        <div className="ml-auto" data-print="hide">
          <ExportPdfButton />
        </div>
      </div>

      <div className="flex flex-col gap-2" data-print="hide">
        <PeriodoSelector atual={periodo} mesesFechados={mesesFechados} />
        <PlataformaSelector atual={plataforma} />
      </div>

      {/* Um mês tem ~4 de cada dia da semana. Um feriado numa terça já move a
          média, e quem lê precisa saber disso antes de agir. */}
      {poucaAmostra && (
        <p className="rounded-lg border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Mês fechado tem só <strong>4 de cada dia da semana</strong> — um
          feriado ou uma chuva já mexe na média. Pra decidir escala, a janela
          de 90 dias é mais firme.
        </p>
      )}

      {/* 99 e Keeta não guardam preço: sozinhas, o relatório inteiro passa a
          medir por pedido. Dizer isso é melhor do que mostrar R$ 0 em tudo. */}
      {rede.total === 0 && rede.totalPedidos > 0 && (
        <p className="rounded-lg border-l-4 border-sky-500 bg-sky-50 px-3 py-2 text-[12px] leading-relaxed text-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
          Essa plataforma não devolve o valor do pedido — aqui o relatório mede
          por <strong>quantidade de pedidos</strong>.
        </p>
      )}

      <DiaSemanaCard dados={rede} titulo="A rede toda" />

      {foraDoPadrao.length > 0 && (
        <section className="rounded-xl border border-amber-300/60 bg-amber-50/60 p-5 dark:border-amber-500/30 dark:bg-amber-950/20">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
            <TriangleAlert className="size-4" />
            Fogem do padrão da rede
          </h2>
          <p className="mb-3 text-[12px] leading-relaxed text-amber-800/90 dark:text-amber-300/90">
            Nesses dias a loja vende uma fatia bem menor da própria semana do
            que a rede vende no mesmo dia. Quando todo mundo cai junto é
            mercado; quando só uma cai, costuma ser operação — fechou mais
            cedo, faltou gente ou ficou sem entregador.
          </p>
          <div className="space-y-1.5">
            {foraDoPadrao.map(({ unit, d }) => (
              <div
                key={unit.id}
                className="flex flex-wrap items-center gap-2 rounded-lg bg-card px-3 py-2 text-xs"
              >
                <BrandLogo size="sm" logoUrl={unit.logo_url} name={unit.name} />
                <Link
                  href={`/unidades/${unit.code}`}
                  className="font-medium hover:underline"
                >
                  {unit.name}
                </Link>
                <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                  #{unit.code}
                </span>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  fraco na
                </span>
                <span className="font-semibold text-rose-700 dark:text-rose-400">
                  {d.diaFraco?.rotulo}
                </span>
                <span
                  className="tabular-nums text-muted-foreground"
                  title="Pontos percentuais abaixo da participação que esse dia tem na rede"
                >
                  {Math.round(d.desvioPp)} pp abaixo da rede
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <MapaCalor linhas={linhas} />

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold">Loja a loja</h2>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Ordenado pela diferença entre o melhor e o pior dia — no topo, quem
          tem a semana mais desequilibrada.
        </p>
        <div className="overflow-x-auto pb-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">Loja</th>
                <th className="pb-2 pr-3 font-medium">Melhor dia</th>
                <th className="pb-2 pr-3 font-medium">Pior dia</th>
                <th className="pb-2 pr-3 text-right font-medium">Diferença</th>
                <th className="pb-2 pr-3 text-right font-medium">Pedidos</th>
                <th className="pb-2 pr-3 text-right font-medium">Total</th>
                <th className="pb-2 font-medium">Semana</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ unit, d }) => {
                // Barra pela mesma régua do melhor/pior daquela loja: numa
                // loja só-99 o valor é zero e todas as barras sumiriam.
                const val = (x: { valor: number; pedidos: number }) =>
                  d.base === "valor" ? x.valor : x.pedidos
                const max = Math.max(...d.dias.map(val), 1)
                return (
                  <tr key={unit.id} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <Link
                        href={`/unidades/${unit.code}`}
                        className="flex items-center gap-2 hover:underline"
                      >
                        <BrandLogo
                          size="sm"
                          logoUrl={unit.logo_url}
                          name={unit.name}
                        />
                        <span className="font-medium">{unit.name}</span>
                        <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                          #{unit.code}
                        </span>
                      </Link>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-emerald-700 dark:text-emerald-400">
                      {d.melhor?.rotuloCurto} ·{" "}
                      {d.base === "valor"
                        ? fmtBRLShort(d.melhor?.valor ?? 0)
                        : `${fmtNum(d.melhor?.pedidos ?? 0)} ped.`}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-rose-700 dark:text-rose-400">
                      {d.pior?.rotuloCurto} ·{" "}
                      {d.base === "valor"
                        ? fmtBRLShort(d.pior?.valor ?? 0)
                        : `${fmtNum(d.pior?.pedidos ?? 0)} ped.`}
                    </td>
                    <td className="py-2 pr-3 text-right font-bold tabular-nums">
                      {Math.round(d.amplitudePct)}%
                    </td>
                    {/* Pedidos soma as QUATRO plataformas; o total em R$ só
                        iFood e Cardápio Web. Loja de 99/Keeta aparece aqui com
                        pedido e sem valor — e é melhor mostrar metade do que
                        somer da tabela. */}
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                      {fmtNum(d.totalPedidos)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                      {d.base === "valor" ? fmtBRL(d.total) : "—"}
                    </td>
                    {/* Mini-barras: o número diz o tamanho, a forma diz onde
                        está o buraco. Juntos respondem mais rápido que os dois
                        separados. */}
                    <td className="py-2">
                      <span
                        className="flex h-6 items-end gap-0.5"
                        title={d.dias
                          .map(
                            (x) =>
                              `${x.rotuloCurto} ${d.base === "valor" ? fmtBRLShort(x.valor) : `${x.pedidos} ped.`}`,
                          )
                          .join(" · ")}
                      >
                        {d.dias.map((x) => (
                          <span
                            key={x.dow}
                            className={`w-2 rounded-sm ${
                              x.dow === d.melhor?.dow
                                ? "bg-emerald-500"
                                : x.dow === d.pior?.dow
                                  ? "bg-rose-400"
                                  : "bg-muted-foreground/25"
                            }`}
                            style={{
                              height: `${Math.max((val(x) / max) * 100, val(x) > 0 ? 10 : 4)}%`,
                            }}
                          />
                        ))}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Loja com menos de 3 dias de operação fica de fora — não dá pra falar
          em padrão de semana com tão pouca amostra, e dia com menos de 15% da
          média da loja conta como fechado. <strong>Pedidos</strong> soma
          iFood, Cardápio Web, 99 Food e Keeta; <strong>valor</strong> só as
          duas primeiras, porque 99 e Keeta não guardam o preço do pedido.
        </p>
      </section>
    </div>
  )
}

function Vazio({ plataforma }: { plataforma?: string | null }) {
  return (
    <div className="flex flex-1 flex-col gap-5 bg-muted/30 p-6">
      <div className="flex items-center gap-2">
        <CalendarDays className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Desempenho por dia da semana
        </h1>
      </div>
      <div className="rounded-xl border border-dashed bg-card p-10 text-center">
        <p className="text-sm font-medium">
          Sem venda no período
          {plataforma ? " nessa plataforma" : ""}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          O relatório soma iFood e Cardápio Web — as outras plataformas guardam
          a data do pedido, mas não o valor.
        </p>
      </div>
    </div>
  )
}
