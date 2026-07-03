"use client"

import * as React from "react"
import { ChevronDown, FileDown, Wallet } from "lucide-react"

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
  /**
   * Apenas iFood: valores que entram direto no caixa da loja (PIX,
   * dinheiro, VR presencial, maquininha) em pedidos do app.
   * liquido + recebidoDireto = "Total faturamento" do Portal iFood.
   */
  recebidoDireto?: number
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
  cmvCats = [],
  operacaoCats = [],
  periodo,
  vrInfo,
  antecipacaoIfood = 0,
  title = "DRE da loja · mês",
  totalLabel = "Resultado total da loja",
}: {
  platforms: DrePlat[]
  totalBruto: number
  totalLiquido: number
  cmv: number
  operacao: number
  /** Categorias que compõem o CMV (abre ao clicar na linha). */
  cmvCats?: { nome: string; valor: number }[]
  /** Categorias que compõem os custos operacionais (abre ao clicar). */
  operacaoCats?: { nome: string; valor: number }[]
  /** Período pro cabeçalho do PDF (ex.: "Julho de 2026"). */
  periodo?: string
  vrInfo?: VrInfo
  /** Taxa de antecipação do iFood (R$, positivo). Juro por receber o repasse
   *  adiantado — exibida como custo financeiro que leva ao "Recebido real no
   *  caixa". NÃO entra na margem (que segue no líquido do repasse). */
  antecipacaoIfood?: number
  /** Cabeçalho do card (default "DRE da loja · mês"). */
  title?: string
  /** Rótulo da linha de resultado final (default "Resultado total da loja"). */
  totalLabel?: string
}) {
  const [sel, setSel] = React.useState<"todas" | PlatformId>("todas")
  const cardRef = React.useRef<HTMLDivElement>(null)
  const multi = platforms.length > 1

  // Exporta a DRE em PDF via impressão do navegador (Salvar como PDF). Clona só
  // este card num overlay filho direto do <body> e esconde todo o resto com
  // display:none (regras em globals.css) — assim o layout colapsa e o PDF sai
  // enxuto, só com a DRE. Limpa o overlay depois de imprimir.
  function exportarPdf() {
    const el = cardRef.current
    if (!el) return
    const clone = el.cloneNode(true) as HTMLElement
    clone.querySelectorAll(".dre-print-hide").forEach((n) => n.remove())
    clone
      .querySelectorAll("details")
      .forEach((d) => d.setAttribute("open", ""))
    const overlay = document.createElement("div")
    overlay.id = "dre-print-overlay"
    overlay.appendChild(clone)
    document.body.appendChild(overlay)
    document.body.classList.add("printing-dre")
    const cleanup = () => {
      overlay.remove()
      document.body.classList.remove("printing-dre")
      window.removeEventListener("afterprint", cleanup)
    }
    window.addEventListener("afterprint", cleanup)
    // Espera o browser pintar o overlay recém-inserido antes de imprimir —
    // sem isso o Chrome captura a folha antes do conteúdo e o PDF sai em branco.
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
  }
  const vrTotal = platforms.reduce((a, p) => a + p.vrLiquido, 0)
  const recebidoDiretoTotal = platforms.reduce(
    (a, p) => a + (p.recebidoDireto ?? 0),
    0,
  )

  // Escopo selecionado
  const isTodas = sel === "todas"
  const plat = isTodas ? null : platforms.find((p) => p.id === sel)
  const bruto = isTodas ? totalBruto : plat?.bruto ?? 0
  const liquido = isTodas ? totalLiquido : plat?.liquido ?? 0
  const taxas = Math.max(0, bruto - liquido)
  const vr = isTodas ? vrTotal : plat?.vrLiquido ?? 0
  // "Recebido direto pela loja" — só iFood tem (PIX/dinheiro/VR/maquininha
  // em pedidos do app). Entra como receita extra, igual o VR mas DIFERENTE
  // do VR (este vem do iFood depois; aquele já entrou no caixa físico).
  const recebidoDireto = isTodas
    ? recebidoDiretoTotal
    : plat?.recebidoDireto ?? 0
  // Antecipação é exclusiva do iFood — aparece em "Todas" ou com o iFood
  // selecionado. É custo financeiro: leva ao "Recebido real no caixa" SEM
  // alterar a margem abaixo (que continua no líquido do repasse).
  const antecip =
    isTodas || sel === "ifood" ? Math.max(0, antecipacaoIfood) : 0
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
  // Operacional sempre entra no resultado (é 0 quando não há custo lançado, aí
  // o resultado operacional = margem).
  const resultadoTotal = resultadoOperacional + vr + recebidoDireto
  // Análise vertical: cada linha como % do faturamento bruto do escopo.
  const pctOf = (v: number) => (bruto > 0 ? (v / bruto) * 100 : 0)

  return (
    <div ref={cardRef} className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Wallet className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{title}</h3>
        {periodo && (
          <span className="hidden text-xs text-muted-foreground print:inline">
            · {periodo}
          </span>
        )}
        <div className="dre-print-hide ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={exportarPdf}
            title="Exportar em PDF"
            className="mr-1 flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <FileDown className="size-3.5" />
            PDF
          </button>
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

      <Row label="Faturamento bruto" value={fmtBRL(bruto)} bold pct={100} />

      {/* Taxas: em "Todas" agrupa por plataforma (clicável); por plataforma
          mostra a abertura direto. */}
      <Row
        label="(−) Taxas das plataformas"
        value={`− ${fmtBRL(taxas)}`}
        muted
        pct={pctOf(taxas)}
      />
      <div className="mb-1 space-y-0.5 pl-1">
        {isTodas
          ? platforms.map((p) => <PlatTaxa key={p.id} plat={p} base={bruto} />)
          : plat && (
              <ItemList
                itens={plat.itens}
                total={plat.taxaTotal}
                base={bruto}
              />
            )}
      </div>

      <Divider />
      <Row
        label="= Líquido das plataformas"
        value={fmtBRL(liquido)}
        bold
        pct={pctOf(liquido)}
      />

      {antecip > 0 && (
        <div className="my-1 ml-1 rounded-md border-l-2 border-amber-300 bg-amber-50/60 py-0.5 pl-3 pr-2 dark:border-amber-800 dark:bg-amber-950/20">
          <Row
            label="(−) Taxa de antecipação iFood"
            value={`− ${fmtBRL(antecip)}`}
            muted
            pct={pctOf(antecip)}
          />
          <Row
            label="= Recebido real no caixa"
            value={fmtBRL(liquido - antecip)}
            bold
          />
          <p className="pb-1 text-[10px] leading-snug text-muted-foreground">
            Juro por receber o repasse adiantado (antecipação automática do
            iFood). É custo financeiro — <b>não entra na margem abaixo</b>, que
            usa o líquido do repasse.
          </p>
        </div>
      )}

      <CostRow
        label="(−) CMV"
        scopeTotal={cmvScope}
        cats={cmvCats}
        share={share}
        base={bruto}
      />
      <Divider />
      <Row
        label="= Margem líquida"
        value={
          <span className="flex items-baseline gap-2">
            {fmtBRL(margem)}
            {cmvScope > 0 && (
              <span
                className={`text-xs font-semibold ${
                  margem >= 0
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-rose-700 dark:text-rose-400"
                }`}
              >
                ({fmtPct(margemPct)})
              </span>
            )}
          </span>
        }
        bold
        negative={margem < 0}
      />

      {/* Custos operacionais (aluguel, folha, etc.) — sempre visível; subtrai da
          margem pra chegar no resultado operacional. Clica pra abrir as
          categorias. */}
      <CostRow
        label="(−) Custos operacionais"
        scopeTotal={opScope}
        cats={operacaoCats}
        share={share}
        base={bruto}
      />
      <Divider />
      <Row
        label="= Resultado operacional"
        value={
          <span className="flex items-baseline gap-2">
            {fmtBRL(resultadoOperacional)}
            {(cmvScope > 0 || opScope > 0) && (
              <span
                className={`text-xs font-semibold ${
                  resultadoOperacional >= 0
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-rose-700 dark:text-rose-400"
                }`}
              >
                ({fmtPct(resultadoOpPct)})
              </span>
            )}
          </span>
        }
        bold
        highlight={vr <= 0 && recebidoDireto <= 0}
        negative={resultadoOperacional < 0}
      />
      {(vr > 0 || recebidoDireto > 0) && (
        <>
          {recebidoDireto > 0 && (
            <Row
              label="(+) Recebido direto pela loja (PIX/dinheiro/VR/maquininha)"
              value={`+ ${fmtBRL(recebidoDireto)}`}
              tone="pos"
              pct={pctOf(recebidoDireto)}
            />
          )}
          {vr > 0 && <VrLine vrLiquido={vr} info={vrInfo} pct={pctOf(vr)} />}
          <Divider />
          <Row
            label={`= ${totalLabel}`}
            value={fmtBRL(resultadoTotal)}
            bold
            highlight
            negative={resultadoTotal < 0}
            pct={pctOf(resultadoTotal)}
          />
        </>
      )}

      <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
        A <b>margem</b> é só das vendas das plataformas (mesma do Resumo). O{" "}
        <b>VR</b> (líquido = recebido − 8%) e o <b>recebido direto pela loja</b>{" "}
        são pagos/recebidos à parte, então entram como ganhos extras no{" "}
        resultado total — não na margem.
        {!isTodas && cmv > 0 && (
          <> CMV e operação rateados pela fatia do bruto desta plataforma.</>
        )}
      </p>
    </div>
  )
}

function VrLine({
  vrLiquido,
  info,
  pct,
}: {
  vrLiquido: number
  info?: VrInfo
  pct?: number
}) {
  // Sem a abertura: linha simples.
  if (!info) {
    return (
      <Row
        label="(+) VR recebido à parte"
        value={`+ ${fmtBRL(vrLiquido)}`}
        tone="pos"
        pct={pct}
      />
    )
  }
  const taxaPct = info.bruto > 0 ? (info.taxa / info.bruto) * 100 : 0
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-1.5 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        <span className="text-xs">(+) VR recebido à parte</span>
        <span className="ml-auto flex items-baseline gap-1.5">
          <span className="text-sm font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
            + {fmtBRL(vrLiquido)}
          </span>
          {pct != null && (
            <span className="w-11 text-right text-[10px] font-normal tabular-nums text-muted-foreground">
              {fmtPct(pct)}
            </span>
          )}
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

function PlatTaxa({ plat, base }: { plat: DrePlat; base: number }) {
  const pct = base > 0 ? (plat.taxaTotal / base) * 100 : 0
  return (
    <details className="group rounded-md">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        <PlatformLogo platform={plat.id} size="sm" />
        <span className="text-muted-foreground">{plat.name}</span>
        <span className="ml-auto flex items-baseline gap-1.5">
          <span className="font-semibold tabular-nums text-rose-700 dark:text-rose-400">
            − {fmtBRL(plat.taxaTotal)}
          </span>
          <span className="w-11 text-right text-[10px] font-normal tabular-nums text-muted-foreground">
            {fmtPct(pct)}
          </span>
        </span>
      </summary>
      <div className="border-l pl-6 pr-1.5">
        <ItemList itens={plat.itens} total={plat.taxaTotal} base={base} />
      </div>
    </details>
  )
}

/** Linha de custo (CMV / operacional). Se houver categorias, vira clicável e
 * abre a abertura por categoria; senão é uma linha simples. Prorateia pela
 * fatia da plataforma selecionada (share). */
function CostRow({
  label,
  scopeTotal,
  cats,
  share,
  base,
}: {
  label: string
  scopeTotal: number
  cats: { nome: string; valor: number }[]
  share: number
  base: number
}) {
  const pctOf = (v: number) => (base > 0 ? (v / base) * 100 : 0)

  // Sem custo lançado → linha simples.
  if (scopeTotal <= 0) {
    return <Row label={label} value="sem custo lançado" muted />
  }

  const itens = cats
    .filter((c) => c.valor > 0)
    .map((c) => ({ nome: c.nome, valor: c.valor * share }))
  const catSum = itens.reduce((a, i) => a + i.valor, 0)
  const resto = scopeTotal - catSum
  if (resto > 0.5) itens.push({ nome: "Outros", valor: resto })

  // Com valor mas sem categorias detalhadas → linha simples (não expande).
  if (itens.length === 0) {
    return (
      <Row
        label={label}
        value={`− ${fmtBRL(scopeTotal)}`}
        muted
        pct={pctOf(scopeTotal)}
      />
    )
  }

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-1.5 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="ml-auto flex items-baseline gap-1.5">
          <span className="text-sm font-medium tabular-nums text-muted-foreground">
            − {fmtBRL(scopeTotal)}
          </span>
          <span className="w-11 text-right text-[10px] font-normal tabular-nums text-muted-foreground">
            {fmtPct(pctOf(scopeTotal))}
          </span>
        </span>
      </summary>
      <div className="ml-6 border-l pl-4 pr-1">
        {itens.map((it) => (
          <div
            key={it.nome}
            className="flex items-baseline justify-between gap-2 py-0.5"
          >
            <span className="truncate text-[11px] text-muted-foreground">
              {it.nome}
            </span>
            <span className="flex shrink-0 items-baseline gap-1.5">
              <span className="text-[11px] tabular-nums text-rose-700 dark:text-rose-400">
                − {fmtBRL(it.valor)}
              </span>
              <span className="w-10 text-right text-[9px] font-normal tabular-nums text-muted-foreground">
                {fmtPct(pctOf(it.valor))}
              </span>
            </span>
          </div>
        ))}
      </div>
    </details>
  )
}

function ItemList({
  itens,
  total,
  base,
}: {
  itens: { label: string; value: number; credit?: boolean }[]
  total: number
  base: number
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
      {itens.map((it) => {
        const pct = base > 0 ? (it.value / base) * 100 : 0
        return (
          <div
            key={it.label}
            className="flex items-baseline justify-between gap-2 py-0.5"
          >
            <span className="truncate text-[11px] text-muted-foreground">
              {it.label}
            </span>
            <span className="flex shrink-0 items-baseline gap-1.5">
              <span
                className={`text-[11px] tabular-nums ${
                  it.credit
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-rose-700 dark:text-rose-400"
                }`}
              >
                {it.credit ? "+" : "−"} {fmtBRL(it.value)}
              </span>
              <span className="w-10 text-right text-[9px] font-normal tabular-nums text-muted-foreground">
                {fmtPct(pct)}
              </span>
            </span>
          </div>
        )
      })}
    </>
  )
}

function Row({
  label,
  value,
  bold,
  muted,
  highlight,
  negative,
  tone,
  pct,
}: {
  label: string
  value: React.ReactNode
  bold?: boolean
  muted?: boolean
  highlight?: boolean
  /** Resultado negativo → tudo em vermelho (fundo + texto quando destacado). */
  negative?: boolean
  tone?: "pos"
  /** % do bruto (análise vertical) — mostrado em cinza ao lado do valor. */
  pct?: number
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-2 py-1.5 ${
        highlight
          ? negative
            ? "-mx-2 rounded-md bg-rose-50 px-2 dark:bg-rose-950/30"
            : "-mx-2 rounded-md bg-emerald-50 px-2 dark:bg-emerald-950/30"
          : ""
      }`}
    >
      <span
        className={`text-xs ${
          bold ? "font-semibold" : muted ? "text-muted-foreground" : ""
        }`}
      >
        {label}
      </span>
      <span className="flex shrink-0 items-baseline gap-1.5">
        <span
          className={`text-sm tabular-nums ${
            bold ? "font-bold" : "font-medium"
          } ${
            negative
              ? "text-rose-700 dark:text-rose-400"
              : tone === "pos"
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
        {pct != null && (
          <span className="w-11 text-right text-[10px] font-normal tabular-nums text-muted-foreground">
            {fmtPct(pct)}
          </span>
        )}
      </span>
    </div>
  )
}

function Divider() {
  return <div className="my-0.5 border-t" />
}
