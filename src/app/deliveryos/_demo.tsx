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

type ResultData = {
  competencia: string
  bruto: number
  liquido: number
  pct: number
  taxas: number
  comissao: number
  entrega: number
  transacao: number
  promo: number
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

export function ExperimenteDemo() {
  const [state, setState] = useState<DemoState>({ s: "idle" })
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    setState({ s: "parsing", name: file.name })
    try {
      const buf = await file.arrayBuffer()
      // Carrega xlsx + o parser real do app só agora (não pesa a página).
      const XLSX = await import("xlsx")
      const { parseIfoodFinanceiro } = await import(
        "@/lib/import/ifood/parse-financeiro"
      )
      const wb = XLSX.read(new Uint8Array(buf), { type: "array" })
      const parsed = parseIfoodFinanceiro(wb)
      const t = parsed.totals
      if (!t.bruto || t.bruto <= 0) {
        throw new Error("SEM_BRUTO")
      }
      const taxas = Math.max(0, t.bruto - t.liquido)
      setState({
        s: "result",
        name: file.name,
        data: {
          competencia: parsed.competencia,
          bruto: t.bruto,
          liquido: t.liquido,
          pct: t.bruto > 0 ? (t.liquido / t.bruto) * 100 : 0,
          taxas,
          comissao: Math.abs(t.comissaoIfood),
          entrega: Math.abs(t.taxaEntrega),
          transacao: Math.abs(t.taxaTransacao),
          promo: Math.abs(t.promocaoLoja),
          pedidos: t.pedidosUnicos,
          ticket: t.pedidosUnicos > 0 ? t.bruto / t.pedidosUnicos : 0,
        },
      })
    } catch {
      setState({
        s: "error",
        msg: "Não reconhecemos esse arquivo como o relatório financeiro do iFood (Conciliação). Por enquanto o teste é só com o do iFood — baixa o de Conciliação e tenta de novo.",
      })
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
                Arraste o relatório do iFood aqui
              </p>
              <p className="mt-1.5 max-w-sm text-sm text-[oklch(0.5_0.01_48)]">
                O financeiro (Conciliação), em <span className="font-mono">.xlsx</span> ou <span className="font-mono">.csv</span>. Ou clique pra escolher.
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
  const itens = [
    { l: "Comissão do iFood", v: data.comissao },
    { l: "Taxa de entrega", v: data.entrega },
    { l: "Taxa de transação", v: data.transacao },
    { l: "Promoções da loja", v: data.promo },
  ].filter((i) => i.v > 0)

  return (
    <div className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[oklch(0.175_0.004_60)] text-left shadow-[0_30px_70px_-30px_rgba(0,0,0,.7)]">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-6 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <FileSpreadsheet className="size-4 shrink-0 text-[oklch(0.7_0_0)]" strokeWidth={2} />
          <span className="truncate font-mono text-xs text-[oklch(0.62_0_0)]">{name}</span>
        </div>
        <span className="shrink-0 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-[oklch(0.65_0_0)]">
          {data.competencia}
        </span>
      </div>

      <div className="p-6 sm:p-8">
        {/* Headline */}
        <p className="text-sm text-[oklch(0.62_0_0)]">Você faturou (bruto)</p>
        <p className="mt-1 text-2xl font-medium text-white sm:text-3xl">{brl(data.bruto)}</p>

        <div className="mt-5 rounded-2xl border border-[oklch(0.4_0.08_25/0.4)] bg-[oklch(0.26_0.06_25)] p-4">
          <p className="flex items-center gap-2 text-sm text-[oklch(0.85_0.1_25)]">
            <TrendingDown className="size-4" strokeWidth={2.2} />
            As taxas do iFood comeram
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
        {itens.length > 0 && (
          <div className="mt-5 space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[oklch(0.55_0_0)]">
              Pra onde foi o dinheiro
            </p>
            {itens.map((i) => (
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
            Testar outro mês
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
