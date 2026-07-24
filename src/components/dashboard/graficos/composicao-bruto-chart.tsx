"use client"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { fmtBRL, fmtBRLShort, fmtPct } from "@/lib/format"

export type Segmento = {
  nome: string
  valor: number
  cor: string
  /** Quando o segmento é de uma plataforma, mostra o logo dela na legenda. */
  plat?: PlatformId
}

/**
 * "Taxas das plataformas" — quanto saiu em taxa no mês e pra qual plataforma
 * foi. A barra é 100% das taxas, dividida por plataforma; a % de cada linha é a
 * fatia daquela plataforma no total de taxas. `bruto` entra só como contexto
 * (quanto as taxas representam do faturamento). Segmentos sem `plat` (líquido)
 * são ignorados aqui.
 */
export function ComposicaoBruto({
  bruto,
  segmentos,
}: {
  bruto: number
  segmentos: Segmento[]
}) {
  const taxas = segmentos.filter((s) => s.plat && s.valor > 0)
  const taxasTotal = taxas.reduce((s, x) => s + x.valor, 0)
  // 1 casa decimal pra fechar 100% com o "% que fica na loja" (que também usa
  // 1 casa) — com inteiro, 41,5% arredondava pra 42% e a soma dava 100,5%.
  const pctDoBruto = bruto > 0 ? (taxasTotal / bruto) * 100 : 0
  const share = (v: number) =>
    taxasTotal > 0 ? Math.round((v / taxasTotal) * 100) : 0

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold tracking-tight">
          Taxas das plataformas
        </h3>
        <p className="text-xs text-muted-foreground">
          Quanto saiu em taxa no mês e pra qual plataforma foi
        </p>
      </div>

      {taxasTotal <= 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Sem taxas no período.
        </p>
      ) : (
        <>
          {/* Total de taxas + contexto (% do bruto) */}
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold tracking-tight tabular-nums">
              {fmtBRL(taxasTotal)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {fmtPct(pctDoBruto)} do total (o que fica + taxa)
            </span>
          </div>

          {/* Barra: 100% das taxas, dividida por plataforma */}
          <div className="flex h-5 w-full gap-[2px] overflow-hidden rounded">
            {taxas.map((s) => (
              <div
                key={s.nome}
                style={{
                  width: `${share(s.valor)}%`,
                  background: s.cor,
                }}
                title={`${s.nome}: ${fmtBRL(s.valor)}`}
              />
            ))}
          </div>

          {/* Por plataforma: logo + valor + fatia das taxas */}
          <div className="mt-3 flex flex-col gap-2">
            {taxas.map((s) => (
              <div key={s.nome} className="flex items-center gap-2 text-sm">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: s.cor }}
                  aria-hidden
                />
                {s.plat && (
                  <PlatformLogo
                    platform={s.plat}
                    size="sm"
                    className="size-5 shrink-0"
                  />
                )}
                <span className="flex-1 font-medium">
                  {s.nome.replace(/^Taxas\s+/, "")}
                </span>
                <span className="font-semibold tabular-nums">
                  {fmtBRLShort(s.valor)}
                </span>
                <span className="w-10 text-right text-xs font-semibold tabular-nums text-muted-foreground">
                  {share(s.valor)}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
