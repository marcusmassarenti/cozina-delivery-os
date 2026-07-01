"use client"

import { useCallback, useRef, useState } from "react"
import {
  ArrowRight,
  Check,
  FileSpreadsheet,
  Loader2,
  Lock,
  RefreshCw,
  TrendingDown,
  Upload,
} from "lucide-react"

import type { NinefoodParseResult } from "@/lib/import/ninefood/types"
import type { KeetaParseResult } from "@/lib/import/keeta/types"

type Platform = "ifood" | "99food" | "keeta"

const PLAT_LABEL: Record<Platform, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
}

type BreakdownItem = { l: string; v: number }

type ResultData = {
  platform: Platform
  platformLabel: string
  competencia: string
  bruto: number
  liquido: number
  pct: number
  taxas: number
  breakdown: BreakdownItem[]
  pedidos: number
  ticket: number
}

type DemoState =
  | { s: "idle" }
  | { s: "parsing"; name: string }
  | { s: "result"; name: string; data: ResultData }
  | { s: "error"; msg: string }

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

const ERR_GENERIC =
  "Não reconhecemos esse arquivo. O teste funciona com o financeiro do iFood (Conciliação) ou os relatórios de pedidos do 99 Food e da Keeta. Baixa um desses e tenta de novo."

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
]

// ─── helpers de soma / mês dominante ─────────────────────────────────
const sum = <T,>(arr: T[], f: (x: T) => number | null | undefined) =>
  arr.reduce((a, x) => a + (f(x) || 0), 0)
const sumAbs = <T,>(arr: T[], f: (x: T) => number | null | undefined) =>
  arr.reduce((a, x) => a + Math.abs(f(x) || 0), 0)

function mesLabel(dates: Array<Date | null | undefined>): string {
  const valid = dates.filter(
    (d): d is Date => d instanceof Date && !isNaN(d.getTime()),
  )
  if (!valid.length) return ""
  const counts = new Map<string, number>()
  for (const d of valid) {
    const k = `${d.getFullYear()}-${d.getMonth()}`
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  let best = ""
  let bestN = -1
  for (const [k, n] of counts) if (n > bestN) [bestN, best] = [n, k]
  const [y, m] = best.split("-").map(Number)
  return `${MESES[m]}/${y}`
}

function build(
  platform: Platform,
  bruto: number,
  liquido: number,
  pedidos: number,
  breakdown: BreakdownItem[],
  competencia: string,
): ResultData {
  const taxas = Math.max(0, bruto - liquido)
  // Trava de honestidade do breakdown: a soma das linhas nunca pode estourar
  // as taxas reais (senão parece que a loja pagou mais do que perdeu). Se
  // estourar (mapa de taxa errado pra aquele relatório), esconde o breakdown
  // e mostra só o headline (que é sempre correto: taxas = bruto − líquido).
  // Se sobrar diferença relevante, completa com "Outras taxas".
  let items = breakdown.filter((b) => b.v > 0)
  const known = items.reduce((a, b) => a + b.v, 0)
  if (known > taxas * 1.15) {
    items = []
  } else if (taxas - known > Math.max(1, taxas * 0.05)) {
    items = [...items, { l: "Outras taxas", v: taxas - known }]
  }
  return {
    platform,
    platformLabel: PLAT_LABEL[platform],
    competencia,
    bruto,
    liquido,
    pct: bruto > 0 ? Math.min(100, (liquido / bruto) * 100) : 0,
    taxas,
    breakdown: items,
    pedidos,
    ticket: pedidos > 0 ? bruto / pedidos : 0,
  }
}

// ─── normalização por plataforma → mesma forma da tela ───────────────
function normNine(r: NinefoodParseResult): ResultData {
  if (r.reportType === "dados_loja") {
    const dias = r.porLoja.flatMap((g) => g.dias)
    if (!dias.length) throw new Error(ERR_GENERIC)
    return build(
      "99food",
      sum(dias, (d) => d.bruto),
      sum(dias, (d) => d.liquido),
      sum(dias, (d) => d.pedidos),
      [
        { l: "Comissão", v: sumAbs(dias, (d) => d.comissaoRs) },
        { l: "Taxa de pagamento", v: sumAbs(dias, (d) => d.taxaCanalPagamentoRs) },
        { l: "Promoções da loja", v: sumAbs(dias, (d) => d.promocoesRs) },
      ],
      mesLabel(dias.map((d) => d.data)),
    )
  }
  if (r.reportType === "dados_pedido") {
    const peds = r.porLoja.flatMap((g) => g.pedidos)
    if (!peds.length) throw new Error(ERR_GENERIC)
    return build(
      "99food",
      sum(peds, (p) => p.receitaVendas),
      sum(peds, (p) => p.receitaRealLoja),
      peds.length,
      [
        { l: "Comissão", v: sumAbs(peds, (p) => p.despesasComissao) },
        { l: "Taxa de pagamento", v: sumAbs(peds, (p) => p.taxaCanalPagamento) },
        { l: "Custos logísticos", v: sumAbs(peds, (p) => p.custosLogisticos) },
        { l: "Promoções da loja", v: sumAbs(peds, (p) => p.despesasOfertas) },
      ],
      mesLabel(peds.map((p) => p.data)),
    )
  }
  throw new Error(
    'Esse é o relatório de itens (cardápio) do 99 Food. Pro cálculo do lucro, sobe o "Dados da loja" ou o "Dados do pedido".',
  )
}

function normKeeta(r: KeetaParseResult): ResultData {
  if (r.reportType === "pedido") {
    const peds = r.porLoja.flatMap((g) => g.pedidos)
    if (!peds.length) throw new Error(ERR_GENERIC)
    return build(
      "keeta",
      sum(peds, (p) => p.vendasItens),
      sum(peds, (p) => p.ganhosLiquidos),
      peds.length,
      [
        { l: "Comissão", v: sumAbs(peds, (p) => p.comissao) },
        { l: "Taxas da plataforma", v: sumAbs(peds, (p) => p.despesasPlataforma) },
      ],
      mesLabel(peds.map((p) => p.data)),
    )
  }
  if (r.reportType === "pedido_recente") {
    const peds = r.porLoja.flatMap((g) => g.pedidos)
    if (!peds.length) throw new Error(ERR_GENERIC)
    return build(
      "keeta",
      sum(peds, (p) => p.valorPagoCliente),
      sum(peds, (p) => p.ganhos),
      peds.length,
      [
        { l: "Comissão", v: sumAbs(peds, (p) => p.comissaoBasica) },
        { l: "Taxa de pagamento online", v: sumAbs(peds, (p) => p.taxaPagamentoOnline) },
        { l: "Saque antecipado", v: sumAbs(peds, (p) => p.taxaSaqueAntecipado) },
      ],
      mesLabel(peds.map((p) => p.data)),
    )
  }
  throw new Error(
    'Esse relatório da Keeta não tem os valores de repasse. Pro cálculo do lucro, sobe o de "Pedidos" ou "Pedidos recentes" da Keeta.',
  )
}

export function ExperimenteDemo() {
  const [state, setState] = useState<DemoState>({ s: "idle" })
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    setState({ s: "parsing", name: file.name })
    try {
      const buf = await file.arrayBuffer()
      // Carrega xlsx + os parsers reais do app só agora (não pesa a página).
      const [XLSX, keetaMod, nineMod, ifoodMod] = await Promise.all([
        import("xlsx"),
        import("@/lib/import/keeta"),
        import("@/lib/import/ninefood"),
        import("@/lib/import/ifood/parse-financeiro"),
      ])

      let data: ResultData

      // Detecta a plataforma: cada parser devolve "unknown" (sem lançar) se
      // o arquivo não for dele. Ordem: Keeta → 99 → iFood.
      const keeta = keetaMod.parseKeetaReport(buf)
      const nine =
        keeta.reportType === "unknown"
          ? nineMod.parseNinefoodReport(buf)
          : null

      if (keeta.reportType !== "unknown") {
        data = normKeeta(keeta)
      } else if (nine && nine.reportType !== "unknown") {
        data = normNine(nine)
      } else {
        // iFood (Conciliação) — qualquer falha aqui vira erro genérico.
        try {
          const wb = XLSX.read(new Uint8Array(buf), { type: "array" })
          const parsed = ifoodMod.parseIfoodFinanceiro(wb)
          const t = parsed.totals
          if (!t.bruto || t.bruto <= 0) throw new Error(ERR_GENERIC)
          data = build(
            "ifood",
            t.bruto,
            t.liquido,
            t.pedidosUnicos,
            [
              { l: "Comissão do iFood", v: Math.abs(t.comissaoIfood) },
              { l: "Taxa de entrega", v: Math.abs(t.taxaEntrega) },
              { l: "Taxa de transação", v: Math.abs(t.taxaTransacao) },
              { l: "Promoções da loja", v: Math.abs(t.promocaoLoja) },
            ],
            parsed.competencia,
          )
        } catch {
          throw new Error(ERR_GENERIC)
        }
      }

      setState({ s: "result", name: file.name, data })
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : ERR_GENERIC
      setState({ s: "error", msg })
    }
  }, [])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const reset = () => setState({ s: "idle" })

  return (
    <div className="mx-auto max-w-3xl">
      {/* CARD principal (dropzone / parsing / result / error) */}
      {state.s === "result" ? (
        <ResultPanel data={state.data} name={state.name} onReset={reset} />
      ) : state.s === "error" ? (
        <div className="rounded-3xl border border-[oklch(0.85_0.08_25)] bg-[oklch(0.97_0.02_25)] p-8 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-white text-[oklch(0.55_0.18_25)]">
            <FileSpreadsheet className="size-6" strokeWidth={1.9} />
          </span>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-[oklch(0.4_0.08_25)]">
            {state.msg}
          </p>
          <button
            onClick={reset}
            className="btn-brand mt-5 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium"
          >
            <RefreshCw className="size-4" strokeWidth={2.2} />
            Tentar outro arquivo
          </button>
        </div>
      ) : (
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center rounded-3xl border-2 border-dashed p-10 text-center transition-colors sm:p-14 ${
            dragging
              ? "border-[var(--brand)] bg-[var(--brand-soft)]"
              : "border-black/15 bg-white hover:border-[var(--brand)] hover:bg-[var(--brand-soft)]/40"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            disabled={state.s === "parsing"}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
            }}
          />
          {state.s === "parsing" ? (
            <>
              <Loader2 className="size-10 animate-spin text-[var(--brand)]" strokeWidth={1.8} />
              <p className="mt-4 font-medium">Lendo {state.name}…</p>
              <p className="mt-1 text-sm text-[oklch(0.5_0.01_48)]">
                Calculando seu lucro real — no seu navegador.
              </p>
            </>
          ) : (
            <>
              <span className="flex size-16 items-center justify-center rounded-2xl bg-[var(--brand)] text-white shadow-[0_14px_30px_-14px_oklch(0.65_0.21_35/.9)]">
                <Upload className="size-7" strokeWidth={2} />
              </span>
              <p className="mt-5 text-lg font-medium">
                Arraste seu relatório aqui
              </p>
              <p className="mt-1.5 max-w-sm text-sm text-[oklch(0.5_0.01_48)]">
                iFood (Conciliação), 99 Food (Dados da loja/pedido) ou Keeta
                (Pedidos), em <span className="font-mono">.xlsx</span> ou{" "}
                <span className="font-mono">.csv</span>. Ou clique pra escolher.
              </p>
              <span className="btn-brand mt-5 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium">
                <FileSpreadsheet className="size-4" strokeWidth={2.2} />
                Escolher arquivo
              </span>
            </>
          )}
        </label>
      )}

      {/* Selo de privacidade */}
      <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-[oklch(0.5_0.01_48)]">
        <Lock className="size-3.5 text-[var(--brand)]" strokeWidth={2.2} />
        Tudo acontece no seu navegador. A planilha não é enviada nem salva em lugar nenhum.
      </p>
    </div>
  )
}

function ResultPanel({
  data,
  name,
  onReset,
}: {
  data: ResultData
  name: string
  onReset: () => void
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[oklch(0.175_0.004_60)] text-left shadow-[0_30px_70px_-30px_rgba(0,0,0,.7)]">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-6 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <FileSpreadsheet className="size-4 shrink-0 text-[oklch(0.7_0_0)]" strokeWidth={2} />
          <span className="truncate font-mono text-xs text-[oklch(0.62_0_0)]">{name}</span>
        </div>
        <span className="shrink-0 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-[oklch(0.65_0_0)]">
          {data.platformLabel}
          {data.competencia ? ` · ${data.competencia}` : ""}
        </span>
      </div>

      <div className="p-6 sm:p-8">
        {/* Headline */}
        <p className="text-sm text-[oklch(0.62_0_0)]">Você faturou (bruto)</p>
        <p className="mt-1 text-2xl font-medium text-white sm:text-3xl">{brl(data.bruto)}</p>

        <div className="mt-5 rounded-2xl border border-[oklch(0.4_0.08_25/0.4)] bg-[oklch(0.26_0.06_25)] p-4">
          <p className="flex items-center gap-2 text-sm text-[oklch(0.85_0.1_25)]">
            <TrendingDown className="size-4" strokeWidth={2.2} />
            As taxas {data.platform === "keeta" ? "da" : "do"}{" "}
            {data.platformLabel} comeram
          </p>
          <p className="mt-1 text-2xl font-medium text-[oklch(0.82_0.14_25)] sm:text-3xl">
            −{brl(data.taxas)}
          </p>
        </div>

        <div className="mt-3 rounded-2xl border border-[oklch(0.4_0.1_150/0.4)] bg-[oklch(0.26_0.07_150)] p-4">
          <p className="text-sm text-[oklch(0.84_0.13_150)]">
            O que de fato entra na sua conta
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-3xl font-medium text-[oklch(0.85_0.16_150)] sm:text-4xl">
              {brl(data.liquido)}
            </p>
            <p className="text-sm text-[oklch(0.78_0.12_150)]">
              só {data.pct.toFixed(1)}% do que você faturou
            </p>
          </div>
        </div>

        {/* Breakdown */}
        {data.breakdown.length > 0 && (
          <div className="mt-5 space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[oklch(0.55_0_0)]">
              Pra onde foi o dinheiro
            </p>
            {data.breakdown.map((i) => (
              <div key={i.l} className="flex items-center justify-between text-[13px]">
                <span className="text-[oklch(0.7_0_0)]">{i.l}</span>
                <span className="tabular-nums text-[oklch(0.78_0.1_25)]">−{brl(i.v)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex items-center gap-5 border-t border-white/[0.06] pt-4 text-xs text-[oklch(0.6_0_0)]">
          <span>{data.pedidos.toLocaleString("pt-BR")} pedidos</span>
          <span>Ticket médio {brl(data.ticket)}</span>
        </div>

        {/* CTA */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <a
            href="#precos"
            className="btn-brand grp inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-[15px] font-medium"
          >
            Quero isso todo mês
            <ArrowRight className="arrow-slide size-[18px]" strokeWidth={2.2} />
          </a>
          <button
            onClick={onReset}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-white/5"
          >
            <RefreshCw className="size-4" strokeWidth={2} />
            Testar outro relatório
          </button>
        </div>
        <p className="mt-3 flex items-center gap-2 text-[11px] text-[oklch(0.55_0_0)]">
          <Check className="size-3.5 text-[oklch(0.7_0.14_150)]" strokeWidth={2.4} />
          Pronto — e nada disso saiu do seu navegador.
        </p>
      </div>
    </div>
  )
}
