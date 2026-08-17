"use client"

import * as React from "react"
import { FileDown } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import { forcarTemaClaroNoPrint } from "@/lib/print-tema-claro"
import type { ItemCusto, ResumoCusto } from "@/lib/data/custo-itens"

/**
 * O painel: o resultado do que foi preenchido, pra quem não vai preencher.
 *
 * ⚠️ SÓ ENTRAM ITENS COM CUSTO. Um item sem custo tem margem desconhecida, não
 * margem zero — deixá-lo no gráfico o pintaria de "prejuízo" e a leitura
 * inteira ficaria errada. Os que faltam aparecem contados no topo, e o número
 * de cobertura acompanha cada bloco.
 *
 * Nada é recalculado aqui: preço, comissão e lucro vêm prontos do
 * `getCustoItens`, o mesmo que a aba de Custos usa.
 */
export function PainelCusto({
  lojaNome,
  periodo,
  resumo,
}: {
  lojaNome: string
  periodo: string
  resumo: ResumoCusto
}) {
  const comCusto = React.useMemo(
    () => resumo.itens.filter((i) => i.custo !== null && i.receita > 0),
    [resumo.itens],
  )

  /**
   * Curva ABC pela receita acumulada — a régua clássica: A até 80%, B até 95%,
   * C o resto. Diz onde vale a pena olhar antes de olhar.
   */
  const abc = React.useMemo(() => {
    const ordenado = [...comCusto].sort((a, b) => b.receita - a.receita)
    const total = ordenado.reduce((s, i) => s + i.receita, 0)
    let acumulado = 0
    return ordenado.map((i) => {
      acumulado += i.receita
      const pct = total > 0 ? acumulado / total : 0
      return {
        item: i,
        acumuladoPct: pct,
        classe: pct <= 0.8 ? "A" : pct <= 0.95 ? "B" : "C",
      }
    })
  }, [comCusto])

  /**
   * Quadrantes: volume × margem, cortados pela MEDIANA da própria loja.
   *
   * Mediana e não média: uma loja com um combo de R$ 200 e trinta itens de
   * R$ 20 tem a média puxada pra cima e cairia quase tudo em "pouco volume".
   * A mediana divide o cardápio ao meio, que é o que a leitura pede.
   */
  const quadrantes = React.useMemo(() => {
    if (comCusto.length < 4) return null
    const mediana = (v: number[]) => {
      const s = [...v].sort((a, b) => a - b)
      const m = Math.floor(s.length / 2)
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
    }
    const corteVol = mediana(comCusto.map((i) => i.qtd))
    const corteMar = mediana(comCusto.map((i) => i.lucroPct ?? 0))

    const grupo = (altoVol: boolean, altaMar: boolean) =>
      comCusto
        .filter(
          (i) =>
            i.qtd >= corteVol === altoVol &&
            (i.lucroPct ?? 0) >= corteMar === altaMar,
        )
        .sort((a, b) => b.receita - a.receita)

    return {
      corteVol,
      corteMar,
      estrela: grupo(true, true),
      cavalo: grupo(true, false),
      enigma: grupo(false, true),
      abacaxi: grupo(false, false),
    }
  }, [comCusto])

  const cmvMedio = React.useMemo(() => {
    const receita = comCusto.reduce((s, i) => s + i.receita, 0)
    const custo = comCusto.reduce((s, i) => s + (i.custo ?? 0) * i.qtd, 0)
    return receita > 0 ? custo / receita : 0
  }, [comCusto])

  const margemMedia =
    resumo.receitaComCusto > 0 ? resumo.lucroMes / resumo.receitaComCusto : 0

  function imprimir() {
    const restaurar = forcarTemaClaroNoPrint()
    let limpo = false
    const limpar = () => {
      if (limpo) return
      limpo = true
      restaurar()
      window.removeEventListener("afterprint", limpar)
    }
    window.addEventListener("afterprint", limpar)
    setTimeout(() => window.print(), 60)
    setTimeout(limpar, 60_000)
  }

  if (comCusto.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-10 text-center">
        <p className="text-sm font-semibold">Ainda não há custo preenchido</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          O painel monta a curva ABC e os quadrantes a partir dos itens que já
          têm custo. Preencha os primeiros na aba <b>Custos</b> — os 20 maiores
          já costumam cobrir quase 90% da receita.
        </p>
      </div>
    )
  }

  const maiorLucroMes = Math.max(...comCusto.map((i) => Math.abs(i.lucroMes ?? 0)), 1)

  return (
    <div className="flex flex-col gap-4">
      <div data-print="hide" className="flex justify-end">
        <button
          onClick={imprimir}
          className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-semibold"
        >
          <FileDown className="size-3.5" />
          Exportar PDF
        </button>
      </div>

      {/* Só aparece no papel: sem isso o PDF sai sem dizer de quem é. */}
      <div className="hidden print:block">
        <p className="text-lg font-bold">{lojaNome}</p>
        <p className="text-xs text-zinc-500">
          Ficha Técnica · {periodo} · Delivery OS
        </p>
      </div>

      {/* ── KPIs ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi rot="Receita analisada" val={fmtBRL(resumo.receitaComCusto)} />
        <Kpi
          rot="Lucro bruto"
          val={fmtBRL(resumo.lucroMes)}
          cor={resumo.lucroMes >= 0 ? "bom" : "ruim"}
        />
        <Kpi
          rot="Margem média"
          val={fmtPct(margemMedia * 100, 1)}
          cor={margemMedia >= 0 ? "bom" : "ruim"}
        />
        <Kpi rot="CMV médio" val={fmtPct(cmvMedio * 100, 1)} />
      </div>

      {resumo.cobertura < 0.999 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Este painel olha <b>{Math.round(resumo.cobertura * 100)}% da receita</b>{" "}
          da loja — os {comCusto.length} itens que já têm custo. Os demais não
          entram porque margem desconhecida não é margem zero.
        </p>
      )}

      {/* ── Curva ABC ─────────────────────────────────────────────── */}
      <div className="break-inside-avoid rounded-xl border bg-card p-4">
        <h2 className="text-sm font-bold">Curva ABC</h2>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          Onde está a receita. <b>A</b> são os itens que somam os primeiros 80%,{" "}
          <b>B</b> vão até 95%, <b>C</b> é a cauda.
        </p>

        <div className="mt-3 flex overflow-hidden rounded-md">
          {(["A", "B", "C"] as const).map((c) => {
            const linhas = abc.filter((x) => x.classe === c)
            const receita = linhas.reduce((s, x) => s + x.item.receita, 0)
            const pct = resumo.receitaComCusto > 0 ? receita / resumo.receitaComCusto : 0
            if (pct <= 0) return null
            return (
              <div
                key={c}
                className={
                  c === "A"
                    ? "bg-emerald-500 px-2 py-1.5 text-[10.5px] font-bold text-white"
                    : c === "B"
                      ? "bg-amber-500 px-2 py-1.5 text-[10.5px] font-bold text-white"
                      : "bg-zinc-400 px-2 py-1.5 text-[10.5px] font-bold text-white"
                }
                style={{ width: `${Math.max(pct * 100, 6)}%` }}
              >
                {c} · {linhas.length}
              </div>
            )
          })}
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead>
              <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3 text-left font-medium">Classe</th>
                <th className="py-2 pr-3 text-left font-medium">Item</th>
                <th className="py-2 pr-3 text-right font-medium">Receita</th>
                <th className="py-2 pr-3 text-right font-medium">% acum.</th>
                <th className="py-2 text-right font-medium">Margem</th>
              </tr>
            </thead>
            <tbody>
              {abc.slice(0, 20).map(({ item, acumuladoPct, classe }) => (
                <tr
                  key={`${item.platform}|${item.nomeItem}`}
                  className="border-b last:border-0"
                >
                  <td className="py-1.5 pr-3">
                    <span
                      className={
                        classe === "A"
                          ? "rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                          : classe === "B"
                            ? "rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                            : "rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground"
                      }
                    >
                      {classe}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3">
                    <span className="flex items-center gap-1.5">
                      <PlatformLogo platform={item.platform} size="sm" />
                      {item.nomeItem}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {fmtBRL(item.receita)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">
                    {fmtPct(acumuladoPct * 100, 0)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    <span
                      className={
                        (item.lucroPct ?? 0) >= 0
                          ? "font-semibold text-emerald-600"
                          : "font-semibold text-rose-600"
                      }
                    >
                      {fmtPct((item.lucroPct ?? 0) * 100, 1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {abc.length > 20 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Mostrando os 20 primeiros de {abc.length}. Os demais somam{" "}
              {fmtBRL(
                abc.slice(20).reduce((s, x) => s + x.item.receita, 0),
              )}
              .
            </p>
          )}
        </div>
      </div>

      {/* ── Quadrantes ────────────────────────────────────────────── */}
      {quadrantes && (
        <div className="break-inside-avoid rounded-xl border bg-card p-4">
          <h2 className="text-sm font-bold">O que fazer com cada item</h2>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            Cortado pela mediana desta loja: {fmtNum(Math.round(quadrantes.corteVol))}{" "}
            unidades e {fmtPct(quadrantes.corteMar * 100, 1)} de margem.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Quadrante
              titulo="Estrela"
              cor="bom"
              legenda="Vende muito e dá margem. Proteja: nada de promoção agressiva."
              itens={quadrantes.estrela}
            />
            <Quadrante
              titulo="Enigma"
              cor="destaque"
              legenda="Dá margem e vende pouco. É aqui que promoção e foto nova se pagam."
              itens={quadrantes.enigma}
            />
            <Quadrante
              titulo="Cavalo de batalha"
              cor="atencao"
              legenda="Vende muito e sobra pouco. Mexer no preço ou no custo aqui vale mais que em qualquer outro lugar."
              itens={quadrantes.cavalo}
            />
            <Quadrante
              titulo="Abacaxi"
              cor="ruim"
              legenda="Não vende e não dá margem. Candidato a sair do cardápio."
              itens={quadrantes.abacaxi}
            />
          </div>
        </div>
      )}

      {/* ── Quem dá e quem tira dinheiro ──────────────────────────── */}
      <div className="break-inside-avoid rounded-xl border bg-card p-4">
        <h2 className="text-sm font-bold">
          Quanto cada item deixou no mês
        </h2>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          Lucro por unidade × quantidade vendida. É o que o item somou de fato.
        </p>
        <div className="mt-3 flex flex-col gap-1.5">
          {[...comCusto]
            .sort((a, b) => (b.lucroMes ?? 0) - (a.lucroMes ?? 0))
            .slice(0, 14)
            .map((i) => {
              const v = i.lucroMes ?? 0
              return (
                <div
                  key={`${i.platform}|${i.nomeItem}`}
                  className="flex items-center gap-2 text-[12.5px]"
                >
                  <span className="w-[38%] shrink-0 truncate" title={i.nomeItem}>
                    {i.nomeItem}
                  </span>
                  <div className="relative h-3.5 flex-1 rounded bg-muted/60">
                    <span
                      className={
                        v >= 0
                          ? "absolute inset-y-0 left-0 rounded bg-emerald-500"
                          : "absolute inset-y-0 left-0 rounded bg-rose-500"
                      }
                      style={{
                        width: `${Math.max((Math.abs(v) / maiorLucroMes) * 100, 1.5)}%`,
                      }}
                    />
                  </div>
                  <span
                    className={
                      v >= 0
                        ? "w-24 shrink-0 text-right tabular-nums font-semibold text-emerald-600"
                        : "w-24 shrink-0 text-right tabular-nums font-semibold text-rose-600"
                    }
                  >
                    {fmtBRL(v)}
                  </span>
                </div>
              )
            })}
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        <b>Margem</b> é preço − comissão da plataforma − custo, sobre o preço.
        Entrega, taxa de serviço e mensalidade são cobradas por pedido ou por mês
        e ficam no DRE da loja, não aqui.
      </p>
    </div>
  )
}

function Kpi({
  rot,
  val,
  cor,
}: {
  rot: string
  val: string
  cor?: "bom" | "ruim"
}) {
  return (
    <div className="rounded-xl border bg-card p-3.5">
      <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
        {rot}
      </p>
      <p
        className={
          cor === "bom"
            ? "text-xl font-bold tabular-nums text-emerald-600"
            : cor === "ruim"
              ? "text-xl font-bold tabular-nums text-rose-600"
              : "text-xl font-bold tabular-nums"
        }
      >
        {val}
      </p>
    </div>
  )
}

function Quadrante({
  titulo,
  legenda,
  itens,
  cor,
}: {
  titulo: string
  legenda: string
  itens: ItemCusto[]
  cor: "bom" | "atencao" | "destaque" | "ruim"
}) {
  const classeTitulo =
    cor === "bom"
      ? "text-emerald-600"
      : cor === "atencao"
        ? "text-amber-600"
        : cor === "destaque"
          ? "text-primary"
          : "text-rose-600"

  return (
    <div className="rounded-lg border p-3">
      <p
        className={`text-[10.5px] font-bold uppercase tracking-wider ${classeTitulo}`}
      >
        {titulo} · {itens.length}
      </p>
      <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
        {legenda}
      </p>
      <ul className="mt-2 space-y-1">
        {itens.slice(0, 5).map((i) => (
          <li
            key={`${i.platform}|${i.nomeItem}`}
            className="flex items-baseline justify-between gap-2 text-[12.5px]"
          >
            <span className="truncate" title={i.nomeItem}>
              {i.nomeItem}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {fmtNum(i.qtd)} un · {fmtPct((i.lucroPct ?? 0) * 100, 0)}
            </span>
          </li>
        ))}
        {itens.length === 0 && (
          <li className="text-[12px] text-muted-foreground">
            Nenhum item aqui.
          </li>
        )}
        {itens.length > 5 && (
          <li className="text-[11px] text-muted-foreground">
            e mais {itens.length - 5}
          </li>
        )}
      </ul>
    </div>
  )
}
