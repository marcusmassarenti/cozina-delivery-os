"use client"

import * as React from "react"
import { ChevronDown, Wallet } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"

export type DrePlat = {
  id: PlatformId
  name: string
  bruto: number
  liquido: number
  taxaTotal: number
  /** VR líquido que entra à parte (só iFood > 0). */
  vrLiquido: number
  /** Abertura das taxas (pode ser parcial; Keeta vem vazio). `credit` = linha
   * positiva (estorno/promoção que a plataforma devolveu), pra fechar com a
   * taxa líquida real. */
  itens: { label: string; value: number; credit?: boolean }[]
}

export type VrInfo = {
  /** Vendido em VR (bruto, do relatório). */
  bruto: number
  /** Taxa estimada (8% padrão — o iFood não detalha a taxa do VR). */
  taxa: number
  /** Recebido na conta (líquido = bruto − taxa). */
  liquido: number
  porBandeira: { bandeira: string; valor: number; pedidos: number }[]
}

/**
 * DRE detalhada da loja com seletor de plataforma. "Todas" mostra o
 * consolidado e agrupa as taxas por plataforma em linhas clicáveis (abrem o
 * detalhe). Por plataforma, mostra a abertura direto. O VR (pago à parte pelo
 * iFood) entra como receita extra antes do CMV. CMV/operação são rateados pela
 * fatia do bruto quando se olha uma plataforma.
 */
export function DreDetalhado({
  platforms,
  totalBruto,
  totalLiquido,
  cmv,
  operacao,
  vrInfo,
  title = "DRE da loja · mês",
  totalLabel = "Resultado total da loja",
}: {
  platforms: DrePlat[]
  totalBruto: number
  totalLiquido: number
  cmv: number
  operacao: number
  vrInfo?: VrInfo
  /** Cabeçalho do card (default "DRE da loja · mês"). */
  title?: string
  /** Rótulo da linha de resultado final (default "Resultado total da loja"). */
  totalLabel?: string
}) {
  const [sel, setSel] = React.useState<"todas" | PlatformId>("todas")
  const multi = platforms.length > 1
  const vrTotal = platforms.reduce((a, p) => a + p.vrLiquido, 0)

  // Escopo selecionado
  const isTodas = sel === "todas"
  const plat = isTodas ? null : platforms.find((p) => p.id === sel)
  const bruto = isTodas ? totalBruto : plat?.bruto ?? 0
  const liquido = isTodas ? totalLiquido : plat?.liquido ?? 0
  const taxas = Math.max(0, bruto - liquido)
  const vr = isTodas ? vrTotal : plat?.vrLiquido ?? 0
  const share = totalBruto > 0 ? bruto / totalBruto : 0
  const cmvScope = isTodas ? cmv : cmv * share
  const opScope = isTodas ? operacao : operacao * share
  // A margem NÃO inclui o VR — pra bater com o Resumo/Hero/dashboard (mesma
  // definição em todo o app). O VR entra DEPOIS como ganho à parte, levando ao
  // "Resultado total da loja". Assim a % de margem fica única e confiável.
  const margem = liquido - cmvScope
  const margemPct = bruto > 0 ? (margem / bruto) * 100 : 0
  const resultadoOperacional = margem - opScope
  const resultadoOpPct = bruto > 0 ? (resultadoOperacional / bruto) * 100 : 0
  const resultadoTotal = (opScope > 0 ? resultadoOperacional : margem) + vr

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Wallet className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="ml-auto flex items-center gap-1">
          {multi && (
            <button
              type="button"
              onClick={() => setSel("todas")}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                isTodas
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              Todas
            </button>
          )}
          {platforms.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSel(multi ? p.id : "todas")}
              aria-label={p.id}
              className={`flex items-center rounded-md p-1 transition-colors ${
                sel === p.id
                  ? "bg-primary/10 ring-1 ring-primary"
                  : multi
                    ? "hover:bg-muted"
                    : ""
              }`}
            >
              <PlatformLogo platform={p.id} size="sm" />
            </button>
          ))}
        </div>
      </div>

      <Row label="Faturamento bruto" value={fmtBRL(bruto)} bold />

      {/* Taxas: em "Todas" agrupa por plataforma (clicável); por plataforma
          mostra a abertura direto. */}
      <Row
        label="(−) Taxas das plataformas"
        value={`− ${fmtBRL(taxas)}`}
        muted
      />
      <div className="mb-1 space-y-0.5 pl-1">
        {isTodas
          ? platforms.map((p) => <PlatTaxa key={p.id} plat={p} />)
          : plat && <ItemList itens={plat.itens} total={plat.taxaTotal} />}
      </div>

      <Divider />
      <Row label="= Líquido das plataformas" value={fmtBRL(liquido)} bold />

      <Row
        label="(−) CMV (Cozina + Loja)"
        value={cmvScope > 0 ? `− ${fmtBRL(cmvScope)}` : "sem custo lançado"}
        muted
      />
      <Divider />
      <Row
        label="= Margem líquida"
        value={
          <span className="flex items-baseline gap-2">
            {fmtBRL(margem)}
            {cmvScope > 0 && (
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                ({fmtPct(margemPct)})
              </span>
            )}
          </span>
        }
        bold
        highlight={opScope <= 0 && vr <= 0}
      />
      {opScope > 0 && (
        <>
          <Row
            label="(−) Custo da operação"
            value={`− ${fmtBRL(opScope)}`}
            muted
          />
          <Divider />
          <Row
            label="= Resultado operacional"
            value={
              <span className="flex items-baseline gap-2">
                {fmtBRL(resultadoOperacional)}
                <span
                  className={`text-xs font-semibold ${
                    resultadoOperacional >= 0
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-rose-700 dark:text-rose-400"
                  }`}
                >
                  ({fmtPct(resultadoOpPct)})
                </span>
              </span>
            }
            bold
            highlight={vr <= 0}
          />
        </>
      )}
      {vr > 0 && (
        <>
          <VrLine vrLiquido={vr} info={vrInfo} />
          <Divider />
          <Row
            label={`= ${totalLabel}`}
            value={fmtBRL(resultadoTotal)}
            bold
            highlight
          />
        </>
      )}

      <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
        A <b>margem</b> é só das vendas das plataformas (mesma do Resumo). O{" "}
        <b>VR</b> é pago à parte pelo iFood e cai na conta da loja (líquido =
        recebido − 8%), então aparece como ganho extra no resultado total.
        {!isTodas && cmv > 0 && (
          <> CMV e operação rateados pela fatia do bruto desta plataforma.</>
        )}
      </p>
    </div>
  )
}

function VrLine({ vrLiquido, info }: { vrLiquido: number; info?: VrInfo }) {
  // Sem a abertura: linha simples.
  if (!info) {
    return (
      <Row
        label="(+) VR recebido à parte"
        value={`+ ${fmtBRL(vrLiquido)}`}
        tone="pos"
      />
    )
  }
  const taxaPct = info.bruto > 0 ? (info.taxa / info.bruto) * 100 : 0
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-1.5 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        <span className="text-xs">(+) VR recebido à parte</span>
        <span className="ml-auto text-sm font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
          + {fmtBRL(vrLiquido)}
        </span>
      </summary>
      <div className="ml-6 border-l pl-4 pr-1">
        <div className="flex items-baseline justify-between gap-2 py-0.5">
          <span className="text-[11px] text-muted-foreground">
            Vendido em VR (bruto)
          </span>
          <span className="text-[11px] font-medium tabular-nums">
            {fmtBRL(info.bruto)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2 py-0.5">
          <span className="text-[11px] text-muted-foreground">
            (−) Taxa estimada ({taxaPct.toFixed(0)}%)
          </span>
          <span className="text-[11px] tabular-nums text-rose-700 dark:text-rose-400">
            − {fmtBRL(info.taxa)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2 border-t py-0.5 pt-1">
          <span className="text-[11px] font-semibold">Recebido na conta</span>
          <span className="text-[11px] font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {fmtBRL(info.liquido)}
          </span>
        </div>
        {info.porBandeira.length > 0 && (
          <div className="mt-1.5 border-t pt-1">
            <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              Por bandeira (bruto)
            </p>
            {info.porBandeira.map((b) => (
              <div
                key={b.bandeira}
                className="flex items-baseline justify-between gap-2 py-0.5"
              >
                <span className="truncate text-[11px] text-muted-foreground">
                  {b.bandeira}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums">
                  {fmtBRL(b.valor)} · {fmtNum(b.pedidos)} ped
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
          A taxa de {taxaPct.toFixed(0)}% é uma estimativa padrão — o iFood não
          detalha a taxa do VR no relatório, então o bruto é real e o líquido é
          aproximado.
        </p>
      </div>
    </details>
  )
}

function PlatTaxa({ plat }: { plat: DrePlat }) {
  return (
    <details className="group rounded-md">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        <PlatformLogo platform={plat.id} size="sm" />
        <span className="text-muted-foreground">{plat.name}</span>
        <span className="ml-auto font-semibold tabular-nums text-rose-700 dark:text-rose-400">
          − {fmtBRL(plat.taxaTotal)}
        </span>
      </summary>
      <div className="border-l pl-6 pr-1.5">
        <ItemList itens={plat.itens} total={plat.taxaTotal} />
      </div>
    </details>
  )
}

function ItemList({
  itens,
  total,
}: {
  itens: { label: string; value: number; credit?: boolean }[]
  total: number
}) {
  if (itens.length === 0) {
    return (
      <p className="py-1 text-[11px] text-muted-foreground">
        Taxa não detalhada por esta plataforma (vem como valor único:{" "}
        {fmtBRL(total)}).
      </p>
    )
  }
  return (
    <>
      {itens.map((it) => (
        <div
          key={it.label}
          className="flex items-baseline justify-between gap-2 py-0.5"
        >
          <span className="truncate text-[11px] text-muted-foreground">
            {it.label}
          </span>
          <span
            className={`shrink-0 text-[11px] tabular-nums ${
              it.credit
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-rose-700 dark:text-rose-400"
            }`}
          >
            {it.credit ? "+" : "−"} {fmtBRL(it.value)}
          </span>
        </div>
      ))}
    </>
  )
}

function Row({
  label,
  value,
  bold,
  muted,
  highlight,
  tone,
}: {
  label: string
  value: React.ReactNode
  bold?: boolean
  muted?: boolean
  highlight?: boolean
  tone?: "pos"
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-2 py-1.5 ${
        highlight ? "-mx-2 rounded-md bg-emerald-50 px-2 dark:bg-emerald-950/30" : ""
      }`}
    >
      <span
        className={`text-xs ${
          bold ? "font-semibold" : muted ? "text-muted-foreground" : ""
        }`}
      >
        {label}
      </span>
      <span
        className={`shrink-0 text-sm tabular-nums ${
          bold ? "font-bold" : "font-medium"
        } ${
          tone === "pos"
            ? "text-emerald-700 dark:text-emerald-400"
            : muted
              ? "text-muted-foreground"
              : highlight
                ? "text-emerald-700 dark:text-emerald-400"
                : ""
        }`}
      >
        {value}
      </span>
    </div>
  )
}

function Divider() {
  return <div className="my-0.5 border-t" />
}
