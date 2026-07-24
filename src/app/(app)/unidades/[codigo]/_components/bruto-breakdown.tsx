"use client"

import * as React from "react"
import { PieChart } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { fmtBRLShort } from "@/lib/format"

type Plat = {
  id: PlatformId
  bruto: number
  liquido: number
  /** Promoção/cupom que a loja bancou (decisão da loja, não taxa). */
  promocoesLoja: number
  /** Recebido direto (dinheiro/PIX na entrega, só iFood): é da loja, não taxa. */
  recebidoDireto?: number
}

/**
 * "Para onde vai o bruto" com seletor de plataforma. Em "Todas" usa o
 * consolidado da loja; por plataforma usa o bruto/líquido daquela plataforma
 * e RATEIA o CMV + custo de operação pela fatia do bruto (a loja lança o custo
 * total, não por plataforma) — assim dá pra ver a margem aproximada por app.
 *
 * O "descontado" do bruto vem separado em DUAS barras:
 *  - Taxa real da plataforma (comissão + entrega + serviço) = descontado − promoLoja
 *  - Promoções da loja (cupom/desconto que a loja bancou) = promocoesLoja
 * Isso evita a impressão de que iFood/Keeta cobram 50% de tarifa quando, na
 * verdade, parte do desconto vem de campanhas que a própria loja banca.
 */
export function BrutoBreakdown({
  platforms,
  totalBruto,
  totalLiquido,
  cmv,
  operacao,
}: {
  platforms: Plat[]
  totalBruto: number
  totalLiquido: number
  cmv: number
  operacao: number
}) {
  const [sel, setSel] = React.useState<"todas" | PlatformId>("todas")
  const multi = platforms.length > 1

  // Escopo selecionado
  let bruto: number
  let liquido: number
  let cmvScope: number
  let opScope: number
  let promoLoja: number
  let recebidoDireto: number
  if (sel === "todas") {
    bruto = totalBruto
    liquido = totalLiquido
    cmvScope = cmv
    opScope = operacao
    promoLoja = platforms.reduce((s, p) => s + (p.promocoesLoja || 0), 0)
    recebidoDireto = platforms.reduce((s, p) => s + (p.recebidoDireto || 0), 0)
  } else {
    const p = platforms.find((x) => x.id === sel)
    bruto = p?.bruto ?? 0
    liquido = p?.liquido ?? 0
    promoLoja = p?.promocoesLoja ?? 0
    recebidoDireto = p?.recebidoDireto ?? 0
    const share = totalBruto > 0 ? bruto / totalBruto : 0
    cmvScope = cmv * share
    opScope = operacao * share
  }
  // O recebido direto (dinheiro/PIX na entrega) é dinheiro da LOJA, não taxa:
  // entra no "Líquido pra loja" e sai do "descontado". Sem isto, a taxa do
  // iFood inflava e o líquido subestimava. VR fica de fora (não é parte do
  // bruto). Mesma régua do DRE.
  const liquidoLoja = liquido + recebidoDireto
  const descontadoTotal = Math.max(0, bruto - liquido - recebidoDireto)
  // Cap em descontadoTotal: caso o relatório some promo > diferença bruto-liq
  // (ex.: estornos), evita "Taxa real" negativa.
  const promoCap = Math.min(promoLoja, descontadoTotal)
  const taxaReal = descontadoTotal - promoCap
  const margem = liquidoLoja - cmvScope
  const resultado = margem - opScope

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PieChart className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Para onde vai o bruto</h3>
        <div className="ml-auto flex items-center gap-1">
          {multi && (
            <button
              type="button"
              onClick={() => setSel("todas")}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                sel === "todas"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              Todas
            </button>
          )}
          {platforms.map((p) => {
            const active = sel === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSel(multi ? p.id : "todas")}
                aria-label={p.id}
                className={`flex items-center rounded-md p-1 transition-colors ${
                  active
                    ? "bg-primary/10 ring-1 ring-primary"
                    : multi
                      ? "hover:bg-muted"
                      : ""
                }`}
              >
                <PlatformLogo platform={p.id} size="sm" />
              </button>
            )
          })}
        </div>
      </div>

      <CompBar
        label="Líquido pra loja"
        value={liquidoLoja}
        base={bruto}
        color="bg-emerald-500"
      />
      <CompBar
        label="Taxa da plataforma"
        sublabel="comissão, entrega, serviço"
        value={taxaReal}
        base={bruto}
        color="bg-rose-500"
      />
      {promoCap > 0 && (
        <CompBar
          label="Promoções da loja"
          sublabel="cupons/descontos que a loja bancou"
          value={promoCap}
          base={bruto}
          color="bg-fuchsia-500"
        />
      )}
      {cmvScope > 0 && (
        <CompBar
          label="CMV (produtos)"
          value={cmvScope}
          base={bruto}
          color="bg-amber-500"
        />
      )}
      {opScope > 0 && (
        <CompBar
          label="Custo da operação"
          value={opScope}
          base={bruto}
          color="bg-orange-500"
        />
      )}
      {cmvScope > 0 && (
        <CompBar
          label={opScope > 0 ? "Resultado operacional" : "Margem líquida"}
          value={Math.max(0, opScope > 0 ? resultado : margem)}
          base={bruto}
          color="bg-blue-500"
          emphasis
        />
      )}

      {sel !== "todas" && cmv > 0 && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          CMV e operação rateados pela fatia do bruto desta plataforma (a loja
          lança o custo total, não por app).
        </p>
      )}
    </div>
  )
}

function CompBar({
  label,
  sublabel,
  value,
  base,
  color,
  emphasis,
}: {
  label: string
  sublabel?: string
  value: number
  base: number
  color: string
  emphasis?: boolean
}) {
  const pct = base > 0 ? (value / base) * 100 : 0
  return (
    <div className="mb-2.5">
      <div className="mb-0.5 flex items-baseline justify-between">
        <span
          className={`text-xs ${emphasis ? "font-semibold" : "text-muted-foreground"}`}
        >
          {label}
          {sublabel && (
            <span className="ml-1 text-[10px] text-muted-foreground/70">
              · {sublabel}
            </span>
          )}
        </span>
        <div className="flex items-baseline gap-2 tabular-nums">
          <span className="text-xs font-semibold">{fmtBRLShort(value)}</span>
          <span className="text-[10px] text-muted-foreground">
            {pct.toFixed(0)}%
          </span>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${color}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  )
}
