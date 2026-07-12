"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  ArrowRight,
  Check,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  Lock,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react"

import type { NinefoodParseResult } from "@/lib/import/ninefood/types"
import type { KeetaParseResult } from "@/lib/import/keeta/types"
import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import {
  DreDetalhado,
  type DrePlat,
} from "@/app/(app)/unidades/[codigo]/_components/dre-detalhado"

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

/**
 * Resultado de EXEMPLO (números fictícios de uma loja iFood) — pro botão
 * "Ver com uma planilha de exemplo" mostrar o painel sem a pessoa ter o arquivo
 * na mão. Passa pela mesma função `build` do fluxo real. Marcado como exemplo.
 */
const SAMPLE_DATA: ResultData = build(
  "ifood",
  48250,
  26538,
  789,
  [
    { l: "Comissão", v: 11100 },
    { l: "Taxa de entrega", v: 3378 },
    { l: "Cupom", v: 2895 },
    { l: "Frete grátis", v: 2895 },
    { l: "Taxa de transação", v: 1444 },
  ],
  "Junho/2026",
)

/** Base pública dos vídeos tutoriais (Supabase Storage, bucket "tutoriais"). */
const TUT =
  "https://srgmmqihgvkmwjkorkva.supabase.co/storage/v1/object/public/tutoriais/"

/** Como baixar o relatório em cada plataforma — vídeo + link direto pro portal. */
const COMO_BAIXAR: {
  id: PlatformId
  label: string
  relatorio: string
  video: string
  portalUrl: string
}[] = [
  {
    id: "ifood",
    label: "iFood",
    relatorio: "Financeiro / Conciliação",
    video: `${TUT}ifood-financeiro.mp4`,
    portalUrl: "https://portal.ifood.com.br/revenue/billaas/home",
  },
  {
    id: "99food",
    label: "99 Food",
    relatorio: "Dados da loja",
    video: `${TUT}99-loja.mp4`,
    portalUrl: "https://merchant.99app.com/pt-BR/manager/report",
  },
  {
    id: "keeta",
    label: "Keeta",
    relatorio: "Baixar dados",
    video: `${TUT}keeta-baixar-dados.mp4`,
    portalUrl: "https://merchant.mykeeta.com/m/web/app/bizdata#/dataDownload",
  },
]

/**
 * `sample`: mostra o botão "Ver com uma planilha de exemplo" (variantes v2/v3).
 * `onResultChange`: avisa o pai quando um resultado aparece/some (pra a seção
 * dar largura total ao DRE).
 */
export function ExperimenteDemo({
  sample = false,
  onResultChange,
}: {
  sample?: boolean
  onResultChange?: (hasResult: boolean) => void
} = {}) {
  const [state, setState] = useState<DemoState>({ s: "idle" })
  const [dragging, setDragging] = useState(false)
  const [guia, setGuia] = useState<(typeof COMO_BAIXAR)[number] | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    onResultChange?.(state.s === "result")
  }, [state.s, onResultChange])

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
    <>
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

      {sample && state.s === "idle" && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() =>
              setState({
                s: "result",
                name: "exemplo — números fictícios",
                data: SAMPLE_DATA,
              })
            }
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-medium text-[oklch(0.4_0.01_48)] transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
          >
            <FileSpreadsheet className="size-4" strokeWidth={2} />
            Não tem o arquivo agora? Ver com uma planilha de exemplo
          </button>
        </div>
      )}

      {/* Como baixar o relatório — vídeo + link direto por plataforma */}
      {state.s === "idle" && (
        <div className="mt-5 border-t border-black/[0.06] pt-4 text-center">
          <p className="text-xs font-medium text-[oklch(0.45_0.01_48)]">
            Não sabe onde baixar? Veja o passo a passo de cada plataforma:
          </p>
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2.5">
            {COMO_BAIXAR.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setGuia(p)}
                className="group inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3.5 py-2 text-sm font-medium transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
              >
                <PlatformLogo platform={p.id} size="sm" />
                {p.label}
                <Play
                  className="size-3 fill-[var(--brand)] text-[var(--brand)]"
                  strokeWidth={0}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>

    {/* Modal: vídeo de como baixar + link direto pro portal.
        Portal no <body> — o Lenis aplica transform no wrapper de scroll, o que
        quebraria `position: fixed` se o modal ficasse dentro da árvore. Estilo
        autossuficiente (sem var(--brand)/.btn-brand, que vivem no .dos-root). */}
    {guia &&
      typeof document !== "undefined" &&
      createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4"
          onClick={() => setGuia(null)}
        >
          <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-3 text-white">
              <p className="flex items-center gap-2 text-sm font-medium">
                <PlatformLogo platform={guia.id} size="sm" />
                Como baixar no {guia.label} — {guia.relatorio}
              </p>
              <button
                type="button"
                onClick={() => setGuia(null)}
                aria-label="Fechar"
                className="rounded-md p-1 transition-colors hover:bg-white/10"
              >
                <X className="size-5" />
              </button>
            </div>
            <video
              src={guia.video}
              controls
              autoPlay
              className="max-h-[70vh] w-full rounded-lg bg-black"
            />
            <div className="mt-3 flex justify-center">
              <a
                href={guia.portalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[oklch(0.65_0.21_35)] px-5 py-2.5 text-sm font-medium text-white shadow-lg transition-colors hover:bg-[oklch(0.57_0.2_33)]"
              >
                <ExternalLink className="size-4" strokeWidth={2.2} />
                Abrir o portal do {guia.label}
              </a>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

/** R$ digitado → número (centavos). Igual ao editor de custos do sistema. */
function parseBRL(s: string): number {
  return parseInt(s.replace(/\D/g, "") || "0", 10) / 100
}
function displayBRL(n: number): string {
  return n === 0
    ? ""
    : n.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
}

function CostInput({
  label,
  value,
  onChange,
  pct,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  pct: number
}) {
  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between gap-2 text-[11px] font-medium text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground/70">
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-2 focus-within:border-[var(--brand)]">
        <span className="text-xs text-muted-foreground">R$</span>
        <input
          type="text"
          inputMode="numeric"
          value={displayBRL(value)}
          onChange={(e) => onChange(parseBRL(e.target.value))}
          placeholder="0,00"
          className="w-full bg-transparent text-sm tabular-nums outline-none"
        />
      </div>
    </div>
  )
}

function CategoryRow({
  cat,
  setCat,
  exemplo,
}: {
  cat: { nome: string; valor: number } | null
  setCat: (c: { nome: string; valor: number } | null) => void
  exemplo: string
}) {
  if (!cat) {
    return (
      <button
        type="button"
        onClick={() => setCat({ nome: "", valor: 0 })}
        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--brand-strong)] hover:underline"
      >
        <Plus className="size-3.5" strokeWidth={2.4} /> adicionar categoria
      </button>
    )
  }
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <input
        type="text"
        value={cat.nome}
        onChange={(e) => setCat({ ...cat, nome: e.target.value })}
        placeholder={exemplo}
        className="w-0 flex-1 rounded-lg border bg-background px-2 py-1.5 text-xs outline-none focus:border-[var(--brand)]"
      />
      <div className="flex items-center gap-1 rounded-lg border bg-background px-2 py-1.5 focus-within:border-[var(--brand)]">
        <span className="text-[11px] text-muted-foreground">R$</span>
        <input
          type="text"
          inputMode="numeric"
          value={displayBRL(cat.valor)}
          onChange={(e) => setCat({ ...cat, valor: parseBRL(e.target.value) })}
          placeholder="0,00"
          className="w-16 bg-transparent text-xs tabular-nums outline-none"
        />
      </div>
      <button
        type="button"
        onClick={() => setCat(null)}
        aria-label="remover categoria"
        className="text-muted-foreground transition-colors hover:text-rose-500"
      >
        <Trash2 className="size-3.5" strokeWidth={2} />
      </button>
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
  // Custos que o cliente lança (como no sistema) — pré-preenchidos com uma
  // estimativa típica pra já mostrar a margem "fechando"; editáveis na hora.
  const [cmv, setCmv] = useState(() => Math.round(data.bruto * 0.32))
  const [operacao, setOperacao] = useState(() => Math.round(data.bruto * 0.12))
  // 1 categoria opcional por custo — pra ver o DRE detalhado (expansível).
  const [cmvCat, setCmvCat] = useState<{ nome: string; valor: number } | null>(
    null,
  )
  const [opCat, setOpCat] = useState<{ nome: string; valor: number } | null>(
    null,
  )

  // Monta a MESMA estrutura que a tela real do sistema recebe (DreDetalhado).
  const platforms: DrePlat[] = [
    {
      id: data.platform,
      name: data.platformLabel,
      bruto: data.bruto,
      liquido: data.liquido,
      taxaTotal: data.taxas,
      vrLiquido: 0,
      itens: data.breakdown.map((b) => ({ label: b.l, value: b.v })),
    },
  ]

  return (
    <div className="text-left">
      {/* Mini-header: arquivo lido */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <FileSpreadsheet className="size-4 shrink-0" strokeWidth={2} />
          <span className="truncate">{name}</span>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--brand-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--brand-strong)]">
          Lido no seu navegador
        </span>
      </div>

      {/* A TELA REAL DO SISTEMA — DreDetalhado + o box de custos ao lado (como
          no app: você lança CMV/operacional e a margem recalcula na hora). */}
      <div className="dark text-foreground grid gap-3 lg:grid-cols-[1fr_236px] lg:items-start">
        <DreDetalhado
          platforms={platforms}
          totalBruto={data.bruto}
          totalLiquido={data.liquido}
          cmv={cmv}
          operacao={operacao}
          cmvCats={cmvCat && cmvCat.valor > 0 ? [{ nome: cmvCat.nome || "Categoria", valor: cmvCat.valor }] : []}
          operacaoCats={opCat && opCat.valor > 0 ? [{ nome: opCat.nome || "Categoria", valor: opCat.valor }] : []}
          periodo={data.competencia}
          title="DRE da sua loja"
          totalLabel="Resultado da loja"
          showPdf={false}
        />

        {/* Box de custos — lance e a margem fecha (igual ao sistema). */}
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm font-semibold">Lance os custos da sua loja</p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            Ajuste com os seus números — a <b>margem</b> e o <b>lucro</b>{" "}
            recalculam na hora, ao lado.
          </p>

          <CostInput
            label="CMV (custo dos produtos)"
            value={cmv}
            onChange={setCmv}
            pct={data.bruto > 0 ? (cmv / data.bruto) * 100 : 0}
          />
          <CategoryRow
            cat={cmvCat}
            setCat={setCmvCat}
            exemplo="Ex.: Carnes"
          />

          <CostInput
            label="Custos operacionais (aluguel, folha…)"
            value={operacao}
            onChange={setOperacao}
            pct={data.bruto > 0 ? (operacao / data.bruto) * 100 : 0}
          />
          <CategoryRow cat={opCat} setCat={setOpCat} exemplo="Ex.: Aluguel" />

          <p className="mt-3 text-[10px] leading-snug text-muted-foreground">
            Adicione uma categoria pra ver o DRE <b>detalhado</b> (clica na linha
            do CMV/custos no DRE ao lado). No sistema, você lança quantas quiser,
            salvas mês a mês.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-black/[0.08] bg-white px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Pedidos no mês
          </p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums leading-none text-[var(--ink)]">
            {data.pedidos.toLocaleString("pt-BR")}
          </p>
        </div>
        <div className="rounded-xl border border-black/[0.08] bg-white px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Ticket médio
          </p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums leading-none text-[var(--ink)]">
            {brl(data.ticket)}
          </p>
        </div>
      </div>

      <p className="mt-3 text-[12px] leading-snug text-muted-foreground">
        É a <b>mesma tela</b> do Delivery OS. Ajuste o CMV e os custos no box ao
        lado e veja a <b>margem</b> e o <b>lucro real</b> fecharem na hora. No
        sistema completo isso vale pra todas as suas lojas, mês a mês.
      </p>

      {/* CTA */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <a
          href="/cadastro"
          className="btn-brand grp inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-[15px] font-medium"
        >
          Quero isso todo mês
          <ArrowRight className="arrow-slide size-[18px]" strokeWidth={2.2} />
        </a>
        <button
          onClick={onReset}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-black/10 px-5 py-3 text-sm font-medium text-[oklch(0.35_0.01_48)] transition-colors hover:bg-black/[0.02]"
        >
          <RefreshCw className="size-4" strokeWidth={2} />
          Testar outro relatório
        </button>
      </div>
      <p className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        <Check className="size-3.5 text-emerald-600" strokeWidth={2.4} />
        Pronto — e nada disso saiu do seu navegador.
      </p>
    </div>
  )
}
