/**
 * Gráficos do painel da Ficha Técnica — SVG puro, sem dependência externa.
 *
 * Segue a mesma linha do `ranking-charts`: cores fixas em hex, porque este
 * painel também vira PDF e o print força tema claro. Cor que depende de token
 * do tema sai errada no papel.
 */
import * as React from "react"

import { fmtBRL, fmtPct } from "@/lib/format"

/** Amarelo = insumo, vermelho = plataforma, verde = o que sobra. */
export const COR = {
  cmv: "#F59E0B",
  taxa: "#F43F5E",
  lucro: "#10B981",
  tabela: "#CBD5E1",
  medio: "#0EA5E9",
  desconto: "#FB923C",
} as const

/** Paleta das categorias. Repete a partir da 8ª — cardápio maior que isso não
 *  se lê em pizza nenhuma, e aí a legenda é que carrega. */
const PALETA = [
  "#0EA5E9", "#10B981", "#F59E0B", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F43F5E", "#64748B",
]
export const corDaFatia = (i: number) => PALETA[i % PALETA.length]

export type Fatia = { rotulo: string; valor: number; cor: string }

/**
 * Rosca (pizza com furo). O furo existe pra caber o total no meio — é o número
 * que a pessoa procura primeiro, e escrevê-lo ali economiza uma legenda.
 */
export function Rosca({
  fatias,
  centroTitulo,
  centroValor,
  tamanho = 168,
}: {
  fatias: Fatia[]
  centroTitulo?: string
  centroValor?: string
  tamanho?: number
}) {
  const total = fatias.reduce((s, f) => s + Math.max(f.valor, 0), 0)
  const R = 54
  const C = 2 * Math.PI * R
  let acumulado = 0

  return (
    <div className="flex items-center gap-4">
      <svg
        viewBox="0 0 140 140"
        style={{ width: tamanho, height: tamanho }}
        className="shrink-0"
        role="img"
      >
        <circle cx="70" cy="70" r={R} fill="none" stroke="#E2E8F0" strokeWidth="20" />
        {total > 0 &&
          fatias.map((f) => {
            const v = Math.max(f.valor, 0)
            if (v <= 0) return null
            const frac = v / total
            const comprimento = frac * C
            // -90° põe o início no topo; o resto gira no sentido horário.
            const offset = -acumulado * C
            acumulado += frac
            return (
              <circle
                key={f.rotulo}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={f.cor}
                strokeWidth="20"
                strokeDasharray={`${comprimento} ${C - comprimento}`}
                strokeDashoffset={offset}
                transform="rotate(-90 70 70)"
              >
                <title>{`${f.rotulo}: ${fmtPct(frac * 100, 1)}`}</title>
              </circle>
            )
          })}
        {centroValor && (
          <>
            <text
              x="70"
              y="66"
              textAnchor="middle"
              className="fill-current"
              style={{ fontSize: 15, fontWeight: 700 }}
            >
              {centroValor}
            </text>
            {centroTitulo && (
              <text
                x="70"
                y="82"
                textAnchor="middle"
                fill="#94A3B8"
                style={{ fontSize: 8.5, textTransform: "uppercase", letterSpacing: 0.6 }}
              >
                {centroTitulo}
              </text>
            )}
          </>
        )}
      </svg>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {fatias.map((f) => {
          const pct = total > 0 ? f.valor / total : 0
          return (
            <li key={f.rotulo} className="flex items-center gap-2 text-[12px]">
              <span
                className="size-2.5 shrink-0 rounded-sm"
                style={{ background: f.cor }}
              />
              <span className="min-w-0 flex-1 truncate">{f.rotulo}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {fmtBRL(f.valor)}
              </span>
              <span className="w-11 shrink-0 text-right font-semibold tabular-nums">
                {fmtPct(pct * 100, 1)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export type LinhaPreco = {
  nomeItem: string
  precoVenda: number | null
  precoMedio: number
  desconto: number | null
  descontoPct: number | null
}

/**
 * Tabela × realizado, item a item.
 *
 * ── O QUE ESTE GRÁFICO EXISTE PRA MOSTRAR ────────────────────────────────
 * A barra inteira é o preço de tabela; a parte cheia é o que entrou de verdade.
 * O pedaço vazio no fim é o desconto — promoção, cupom ou preço que mudou no
 * meio do período. Ver esse rabo em vinte itens de uma vez é diferente de ler
 * vinte linhas de tabela: é onde se enxerga que a "promoção pontual" virou o
 * preço da casa.
 *
 * Item sem preço de tabela não vira barra pela metade: sai da lista, com a
 * contagem dita em cima. Barra curta por falta de cadastro seria lida como
 * desconto grande, que é o contrário do que aconteceu.
 */
export function BarrasTabelaVsMedio({ linhas }: { linhas: LinhaPreco[] }) {
  const maximo = Math.max(
    ...linhas.map((l) => Math.max(l.precoVenda ?? 0, l.precoMedio)),
    1,
  )

  return (
    <div className="space-y-2">
      {linhas.map((l) => {
        const venda = l.precoVenda ?? l.precoMedio
        const larguraTotal = (venda / maximo) * 100
        const larguraMedio = (l.precoMedio / maximo) * 100
        const temDesconto = (l.desconto ?? 0) > 0.005
        return (
          <div key={l.nomeItem} className="flex items-center gap-2.5">
            <span className="w-40 shrink-0 truncate text-[11.5px]" title={l.nomeItem}>
              {l.nomeItem}
            </span>
            <div className="relative h-5 min-w-0 flex-1">
              {/* Trilho = preço de tabela */}
              <div
                className="absolute inset-y-0 left-0 rounded-sm"
                style={{ width: `${larguraTotal}%`, background: COR.tabela }}
              />
              {/* Cheio = o que entrou */}
              <div
                className="absolute inset-y-0 left-0 rounded-sm"
                style={{ width: `${larguraMedio}%`, background: COR.medio }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-[11.5px] font-semibold tabular-nums">
              {fmtBRL(l.precoMedio)}
            </span>
            <span className="w-24 shrink-0 text-right text-[11px] tabular-nums">
              {temDesconto ? (
                <span style={{ color: COR.desconto }} className="font-semibold">
                  −{fmtBRL(l.desconto as number)}{" "}
                  <span className="opacity-70">
                    {fmtPct((l.descontoPct as number) * 100, 0)}
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">sem desconto</span>
              )}
            </span>
          </div>
        )
      })}

      <div className="flex flex-wrap items-center gap-4 border-t pt-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: COR.medio }} />
          preço médio (o que entrou)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: COR.tabela }} />
          preço de tabela
        </span>
      </div>
    </div>
  )
}
