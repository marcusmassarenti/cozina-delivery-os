"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { BrandLogo } from "@/components/brand-logo"
import { PlatformLogo } from "@/components/platform-logo"
import type { Unit } from "@/lib/data/units"
import { fmtBRL, fmtBRLShort, fmtNum, fmtPct } from "@/lib/format"

/**
 * Ranking + detalhe num card só: as lojas viram barras clicáveis (por
 * faturamento bruto) e, ao selecionar uma, todo o detalhe dela — pedidos,
 * ticket, bruto, líquido, % loja e a margem por plataforma — aparece ao lado,
 * sem precisar da tabela gigante embaixo. Substitui o ranking + tabela por um
 * bloco compacto; a tabela completa fica atrás de um toggle.
 */
export function RankingDetalhado({
  units,
  brandLogoUrl = null,
}: {
  units: Unit[]
  brandLogoUrl?: string | null
}) {
  const ordenadas = React.useMemo(
    () =>
      [...units].sort(
        (a, b) => b.monthly.faturamentoBruto - a.monthly.faturamentoBruto,
      ),
    [units],
  )
  const comFat = ordenadas.filter((u) => u.monthly.faturamentoBruto > 0)
  const max = Math.max(1, ...comFat.map((u) => u.monthly.faturamentoBruto))

  const [selCode, setSelCode] = React.useState<string | null>(
    ordenadas[0]?.code ?? null,
  )
  const sel =
    ordenadas.find((u) => u.code === selCode) ?? ordenadas[0] ?? null

  if (ordenadas.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <p className="py-6 text-center text-xs text-muted-foreground">
          Nenhuma unidade pra ranquear.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      {/* ─── Ranking clicável ─────────────────────────────────── */}
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold tracking-tight">
            Ranking de lojas
          </h3>
          <p className="text-xs text-muted-foreground">
            Faturamento bruto no período — clique pra ver o detalhe
          </p>
        </div>
        {comFat.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Sem faturamento no período.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {comFat.map((u, i) => {
              const ativo = u.code === sel?.code
              return (
                <button
                  key={u.code}
                  type="button"
                  onClick={() => setSelCode(u.code)}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                    ativo ? "bg-muted" : "hover:bg-muted/50"
                  }`}
                >
                  <span className="w-4 shrink-0 text-right font-semibold tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="w-24 shrink-0 truncate" title={u.name}>
                    {u.name}
                  </span>
                  <div className="relative h-3.5 flex-1 overflow-hidden rounded bg-muted/50">
                    <div
                      className={`absolute inset-y-0 left-0 rounded transition-[width] ${
                        ativo ? "bg-primary" : "bg-primary/55"
                      }`}
                      style={{
                        width: `${(u.monthly.faturamentoBruto / max) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right font-medium tabular-nums">
                    {fmtBRLShort(u.monthly.faturamentoBruto)}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ─── Detalhe da loja selecionada ──────────────────────── */}
      {sel && <DetalheLoja unit={sel} brandLogoUrl={brandLogoUrl} />}
    </div>
  )
}

export function DetalheLoja({
  unit,
  brandLogoUrl = null,
}: {
  unit: Unit
  brandLogoUrl?: string | null
}) {
  const m = unit.monthly
  const hasData = m.pedidos > 0
  // O que FICA COM A LOJA não é só o repasse da plataforma: o recebido direto
  // (PIX/dinheiro/maquininha na entrega) já está no bolso do dono e o VR é pago
  // à parte — ambos fora do repasse. Somar os três dá o "Resultado total da
  // loja" do DRE (a mesma régua). Só o líquido subestima quanto o dono embolsa.
  const recebidoDireto = m.platforms.reduce(
    (a, p) => a + (p.recebidoDireto ?? 0),
    0,
  )
  const vrLiquido = Math.max(0, m.vrRecebido - m.vrTaxaMedia8)
  const extraForaRepasse = recebidoDireto // VR nao: ja esta no repasse
  const resultadoLoja = m.faturamentoLiquido + extraForaRepasse
  // "% que fica" + "% de taxa" fecham 100%: a base é TODO o dinheiro que
  // circulou (o que a loja recebeu + a taxa da plataforma). O VR entra do lado
  // da loja; a taxa NÃO conta o recebido direto (não é taxa).
  const taxaLoja = m.platforms.reduce(
    (a, p) => a + Math.max(0, p.bruto - p.liquido - (p.recebidoDireto ?? 0)),
    0,
  )
  const totalDinheiro = resultadoLoja + taxaLoja
  const pctLoja =
    totalDinheiro > 0 ? (resultadoLoja / totalDinheiro) * 100 : 0
  const pctTone =
    pctLoja >= 60
      ? "text-emerald-700 dark:text-emerald-400"
      : pctLoja >= 50
        ? "text-amber-700 dark:text-amber-400"
        : "text-rose-700 dark:text-rose-400"

  return (
    <div className="rounded-xl border bg-card p-4">
      {/* Cabeçalho da loja */}
      <div className="mb-3 flex items-center gap-2">
        <BrandLogo
          size="md"
          logoUrl={unit.logoUrl ?? brandLogoUrl}
          name={unit.name}
        />
        <span className="inline-flex shrink-0 items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
          #{unit.code}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {unit.name}
        </span>
      </div>

      {!hasData ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Sem dados importados neste mês.
        </p>
      ) : (
        <>
          {/* Números-chave */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi label="Pedidos" value={fmtNum(m.pedidos)} />
            <Kpi label="Ticket" value={fmtBRL(m.ticketMedio)} />
            <Kpi label="Bruto" value={fmtBRLShort(m.faturamentoBruto)} />
            <Kpi label="Líquido" value={fmtBRLShort(m.faturamentoLiquido)} />
          </div>

          {/* % que fica na loja — RESULTADO TOTAL (repasse + recebido direto +
              VR), a mesma régua do "Resultado total da loja" no DRE. */}
          <div className="mt-2 rounded-md bg-muted/50 px-3 py-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                % que fica na loja
              </span>
              <span className={`text-base font-bold ${pctTone}`}>
                {fmtPct(pctLoja)}
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                  {fmtBRLShort(resultadoLoja)}
                </span>
              </span>
            </div>
            {extraForaRepasse > 0.005 && (
              <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
                Inclui {fmtBRLShort(extraForaRepasse)} de venda direta —
                dinheiro, PIX ou maquininha pagos na loja, que não passam pelo
                repasse. Por isso fica acima do repasse de cada plataforma.
              </p>
            )}
          </div>

          {/* Margem por plataforma */}
          <p className="mt-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Margem por plataforma
          </p>
          <div className="flex flex-col gap-2">
            {m.platforms
              .filter((p) => unit.platforms.includes(p.id))
              .map((p) => {
              // Peso da plataforma no faturamento DA UNIDADE. Sem isso o
              // lojista lê "iFood R$ 22,9 mil" e não sabe se é metade ou um
              // décimo do que ele fatura — e é essa fração que decide onde
              // vale brigar por taxa. Base = soma das plataformas que a loja
              // usa, não o bruto do card: o bruto inclui cancelados (régua do
              // portal) e as fatias não fechariam 100%.
              const totalPlats = m.platforms
                .filter((x) => unit.platforms.includes(x.id))
                .reduce((t, x) => t + x.bruto, 0)
              const pctDoTotal = totalPlats > 0 ? (p.bruto / totalPlats) * 100 : 0
              // Recebido direto (iFood) é da loja, não taxa: entra na fatia da
              // loja e sai da taxa — a barra fecha 100% e a taxa não infla.
              const recDir = p.recebidoDireto ?? 0
              const lojaValorP = p.liquido + recDir
              const pctLojaP = p.bruto > 0 ? (lojaValorP / p.bruto) * 100 : 0
              const pTaxas = Math.max(0, p.bruto - p.liquido - recDir)
              const pctTaxas = Math.max(0, 100 - pctLojaP)
              // A fatia da loja abre em duas: o que a plataforma repassa e o
              // que o cliente pagou na porta (dinheiro/PIX/maquininha). Sem
              // essa separação o lojista lê tudo como repasse e acha que o
              // iFood mandou mais do que mandou — foi o que o Diego apontou.
              const pctRepasseP = p.bruto > 0 ? (p.liquido / p.bruto) * 100 : 0
              const pctDiretaP = p.bruto > 0 ? (recDir / p.bruto) * 100 : 0
              const hasP = p.bruto > 0
              return (
                <div key={p.id} className="rounded-md border bg-card p-2">
                  {/* Hierarquia: cada % desta caixa responde uma pergunta
                      diferente, e antes os quatro saíam do mesmo jeito — o
                      peso da plataforma brigava com a margem na mesma linha.
                      Agora o peso desce pra baixo do nome, rotulado e em
                      cinza: é característica da plataforma, não resultado.
                      Os % da barra ficam sozinhos na linha de baixo, cada um
                      colado na cor da sua fatia. */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <PlatformLogo platform={p.id} size="sm" />
                      <div className="leading-tight">
                        <span className="block text-xs font-semibold">
                          {p.name}
                        </span>
                        {hasP && (
                          <span className="block text-[10px] text-muted-foreground">
                            {pctDoTotal.toFixed(0)}% do faturamento
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold tabular-nums">
                      {fmtBRLShort(p.bruto)}
                    </span>
                  </div>
                  {hasP ? (
                    <>
                      <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="bg-emerald-500"
                          style={{ width: `${pctRepasseP}%` }}
                        />
                        <div
                          className="bg-teal-300 dark:bg-teal-400"
                          style={{ width: `${pctDiretaP}%` }}
                        />
                        <div
                          className="bg-slate-500 dark:bg-slate-600"
                          style={{ width: `${pctTaxas}%` }}
                        />
                      </div>
                      <div className="mt-1 flex items-baseline justify-between text-[10px] tabular-nums leading-tight">
                        <span className="text-emerald-700 dark:text-emerald-400">
                          <span className="font-bold">{fmtPct(pctLojaP)}</span>{" "}
                          <span className="text-muted-foreground">
                            {fmtBRLShort(lojaValorP)}
                          </span>
                        </span>
                        <span className="text-slate-700 dark:text-slate-400">
                          <span className="font-bold">{fmtPct(pctTaxas)}</span>{" "}
                          <span className="text-muted-foreground">
                            {fmtBRLShort(pTaxas)}
                          </span>
                        </span>
                      </div>
                      {recDir > 0 && (
                        <p className="mt-0.5 text-[10px] leading-tight tabular-nums text-teal-700 dark:text-teal-300">
                          desses, {fmtPct(pctDiretaP)} ({fmtBRLShort(recDir)})
                          o cliente pagou direto na loja
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Sem movimento
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Legenda: sem ela as três cores viram enfeite. A ordem segue a da
              barra, pra leitura ser direta da esquerda pra direita. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-emerald-500" />
              Repasse da plataforma
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-teal-300 dark:bg-teal-400" />
              Venda direta (pago na loja)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-slate-500 dark:bg-slate-600" />
              Fica com a plataforma
            </span>
          </div>
        </>
      )}

      <Link
        href={`/unidades/${unit.code}`}
        className="mt-3 flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        Ir para a unidade
        <ChevronRight className="size-3.5" />
      </Link>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border bg-card px-2.5 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  )
}
