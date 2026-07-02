"use client"

import * as React from "react"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  probeAll,
  probeOversizePage,
  probeReply,
  probeReplyInvalid,
  probeReviewDetail,
  probeReviews,
  probeSummary,
  type ReviewProbeState,
} from "../_actions"

const SANDBOX = "500f2b4d-1807-4a9c-9e7d-93e87c128891"
/** UUID claramente inexistente — pro teste do Cenário 2. */
const FAKE_ID = "00000000-0000-0000-0000-000000000000"

type Action = (prev: ReviewProbeState, fd: FormData) => Promise<ReviewProbeState>

/**
 * Tela de homologação do Review, organizada nos 3 CENÁRIOS do checklist de
 * validação do iFood (#29261721) — cada bloco mapeia 1:1 com um vídeo a gravar.
 */
export function ReviewTester() {
  const [merchantId, setMerchantId] = React.useState(SANDBOX)
  const [dateFrom, setDateFrom] = React.useState("")
  const [dateTo, setDateTo] = React.useState("")
  const [size, setSize] = React.useState("10")
  const [reviewId, setReviewId] = React.useState("")
  const [text, setText] = React.useState(
    "Obrigado pela avaliação! Ficamos felizes que gostou. 🙌",
  )
  const [result, setResult] = React.useState<ReviewProbeState | null>(null)
  const [activeLabel, setActiveLabel] = React.useState<string | null>(null)
  const [activeScenario, setActiveScenario] = React.useState<number | null>(null)
  const [pending, startTransition] = React.useTransition()

  // Janela padrão VÁLIDA (60 dias) — a API recusa intervalo > 90 dias.
  // Setado no cliente (evita mismatch de hidratação com new Date()).
  React.useEffect(() => {
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    const to = new Date()
    const from = new Date(to.getTime() - 60 * 864e5)
    setDateTo((v) => v || iso(to))
    setDateFrom((v) => v || iso(from))
  }, [])

  // Guard dos 90 dias: a API devolve 400 se (dateTo - dateFrom) > 90 dias.
  const dateSpanDays =
    dateFrom && dateTo
      ? Math.round(
          (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 864e5,
        )
      : null
  const dateInvalid = dateSpanDays != null && (dateSpanDays < 0 || dateSpanDays > 90)

  function run(
    scenario: number,
    label: string,
    action: Action,
    extra?: Record<string, string>,
  ) {
    const fd = new FormData()
    fd.set("merchantId", merchantId)
    if (extra) for (const [k, v] of Object.entries(extra)) fd.set(k, v)
    setActiveLabel(label)
    setActiveScenario(scenario)
    setResult(null)
    startTransition(async () => {
      const r = await action({ ok: false }, fd)
      setResult(r)
    })
  }

  /** Resultado logo ABAIXO do cenário `n` que foi clicado (não confunde). */
  function slot(n: number) {
    if (activeScenario !== n) return null
    if (pending)
      return (
        <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Rodando {activeLabel}…
        </p>
      )
    if (result)
      return (
        <ResultCard
          result={result}
          activeLabel={activeLabel}
          onUseReviewId={setReviewId}
        />
      )
    return null
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Loja de teste (sandbox do app de teste) */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">
          Merchant (loja de teste)
        </label>
        <input
          value={merchantId}
          onChange={(e) => setMerchantId(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-1.5 font-mono text-xs"
        />
      </div>

      {/* ───────── Cenário 1 — Listar Avaliações ───────── */}
      <Scenario
        n={1}
        title="Listar Avaliações"
        desc="Listar ≥3 com os campos obrigatórios · filtro por data · teste de limite de página (pedir >50 deve dar 400)"
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Field label="dateFrom (YYYY-MM-DD)">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
            />
          </Field>
          <Field label="dateTo (YYYY-MM-DD)">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
            />
          </Field>
          <Field label="pageSize (máx 50)">
            <input
              type="number"
              min={1}
              max={50}
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
            />
          </Field>
        </div>
        {dateSpanDays != null && (
          <p
            className={`text-[11px] ${
              dateInvalid
                ? "text-rose-600 dark:text-rose-400"
                : "text-muted-foreground"
            }`}
          >
            {dateInvalid
              ? dateSpanDays < 0
                ? "⚠️ A data inicial está depois da final."
                : `⚠️ Intervalo de ${dateSpanDays} dias — a API do iFood recusa acima de 90 dias. Reduza a janela.`
              : `Janela de ${dateSpanDays} dia${dateSpanDays === 1 ? "" : "s"} (válida · máx 90).`}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={pending || dateInvalid}
            onClick={() =>
              run(1, "Listar avaliações", probeReviews, { size, dateFrom, dateTo })
            }
          >
            Listar avaliações
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(1, "Teste de limite (pageSize=100 → deve dar 400)", probeOversizePage)
            }
          >
            Testar limite (&gt;50 → 400)
          </Button>
        </div>
        {slot(1)}
      </Scenario>

      {/* ───────── Cenário 2 — Obter Detalhes ───────── */}
      <Scenario
        n={2}
        title="Obter Detalhes"
        desc="Detalhe completo de 1 avaliação · testar um ID inexistente (deve dar 404)"
      >
        <Field label="reviewId (clique no '1º reviewId' do resultado pra preencher)">
          <input
            value={reviewId}
            onChange={(e) => setReviewId(e.target.value)}
            placeholder="cole o id de uma avaliação"
            className="w-full rounded-md border bg-background px-3 py-1.5 font-mono text-xs"
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={pending || !reviewId}
            onClick={() => run(2, "Detalhe da avaliação", probeReviewDetail, { reviewId })}
          >
            Ver detalhe
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(2, "Detalhe de ID inexistente", probeReviewDetail, {
                reviewId: FAKE_ID,
              })
            }
          >
            Testar ID inexistente
          </Button>
        </div>
        {slot(2)}
      </Scenario>

      {/* ───────── Cenário 3 — Responder Avaliações ───────── */}
      <Scenario
        n={3}
        title="Responder Avaliações"
        desc="Avaliação NOT_REPLIED → responde (201) · texto inválido → recusa (400)"
      >
        <p className="text-[11px] text-muted-foreground">
          Usa o <b>reviewId</b> do Cenário 2. Texto válido: de <b>10 a 300</b>{" "}
          caracteres → <b>201</b>. Texto vazio ou &lt; 10 caracteres → a API
          recusa com <b>400</b> (&quot;reply should not be blank&quot; /
          &quot;minimum of 10 and a max of 300&quot;).
        </p>
        <Field label="Resposta">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            className="w-full rounded-md border bg-background px-3 py-1.5 text-xs"
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={pending || !reviewId}
            onClick={() => run(3, "Responder avaliação", probeReply, { reviewId, text })}
          >
            Responder
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !reviewId}
            onClick={() =>
              run(
                3,
                "Texto inválido: curto (< 10) → 400 esperado",
                probeReplyInvalid,
                { reviewId, text: "ok" },
              )
            }
          >
            Texto curto (&lt; 10)
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !reviewId}
            onClick={() =>
              run(3, "Texto inválido: vazio → 400 esperado", probeReplyInvalid, {
                reviewId,
                text: "",
              })
            }
          >
            Texto vazio
          </Button>
        </div>
        {slot(3)}
      </Scenario>

      {/* Extras (não exigidos pelo checklist, mas úteis) */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run(0, "Rodar tudo (paginação completa)", probeAll)}
          >
            Rodar tudo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run(0, "Summary", probeSummary)}
          >
            Summary
          </Button>
        </div>
        {slot(0)}
      </div>

    </div>
  )
}

/** Painel de resultado — renderizado embaixo do cenário que foi clicado. */
function ResultCard({
  result,
  activeLabel,
  onUseReviewId,
}: {
  result: ReviewProbeState
  activeLabel: string | null
  onUseReviewId: (id: string) => void
}) {
  return (
        <div
          className={`mt-3 overflow-hidden rounded-xl border p-4 ${
            result.ok
              ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20"
              : "border-rose-300 bg-rose-50/50 dark:border-rose-900/50 dark:bg-rose-950/20"
          }`}
        >
          {/* Cabeçalho: badge de HTTP + o que foi testado */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-bold ${
                result.ok
                  ? "bg-emerald-600 text-white"
                  : "bg-rose-600 text-white"
              }`}
            >
              {result.ok ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <XCircle className="size-4" />
              )}
              HTTP {result.status ?? "—"}
            </span>
            <span className="text-sm font-semibold">{activeLabel}</span>
          </div>

          {result.error && (
            <p className="mt-2 text-sm font-medium text-rose-700 dark:text-rose-400">
              {result.error}
            </p>
          )}

          {result.meta && (
            <div className="mt-3 flex flex-col gap-2 text-sm">
              {/* Chips de métricas */}
              <div className="flex flex-wrap gap-2">
                <Chip label="Total" value={result.meta.total ?? "—"} strong />
                <Chip label="Nesta página" value={result.meta.count ?? 0} />
                <Chip label="Páginas" value={result.meta.pageCount ?? "—"} />
                {result.meta.sizeUsed != null && (
                  <Chip label="pageSize" value={result.meta.sizeUsed} />
                )}
              </div>
              {(result.meta.dateFrom || result.meta.dateTo) && (
                <p className="text-[13px] text-muted-foreground">
                  <b className="text-foreground">Filtro de data:</b>{" "}
                  {result.meta.dateFrom ?? "—"} → {result.meta.dateTo ?? "—"}
                </p>
              )}
              {result.meta.statuses && result.meta.statuses.length > 0 && (
                <p className="text-[13px] text-muted-foreground">
                  <b className="text-foreground">Status:</b>{" "}
                  {result.meta.statuses.join(", ")}
                </p>
              )}
              {result.meta.visibilities && result.meta.visibilities.length > 0 && (
                <p className="text-[13px] text-muted-foreground">
                  <b className="text-foreground">Visibility:</b>{" "}
                  {result.meta.visibilities.join(", ")} ·{" "}
                  <b className="text-foreground">Tem respostas:</b>{" "}
                  {result.meta.hasReplies ? "sim" : "não"}
                </p>
              )}
              {result.meta.firstReviewId && (
                <button
                  type="button"
                  onClick={() => onUseReviewId(result.meta!.firstReviewId!)}
                  className="w-fit rounded-md border border-foreground/20 bg-background px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-muted"
                >
                  <span className="text-muted-foreground">
                    Usar este reviewId nos Cenários 2/3:
                  </span>{" "}
                  <span className="font-mono font-medium underline">
                    {result.meta.firstReviewId}
                  </span>
                </button>
              )}
            </div>
          )}

          {result.raw && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[13px] font-medium text-muted-foreground hover:text-foreground">
                Ver resposta completa (JSON)
              </summary>
              <pre className="mt-2 max-h-72 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words rounded-lg bg-background/70 p-3 text-xs leading-relaxed">
                {prettyJson(result.raw)}
              </pre>
            </details>
          )}
        </div>
  )
}

/** Formata o JSON pra leitura; se veio truncado/ inválido, devolve como está. */
function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

/** Chip de métrica (número grande + rótulo) pro painel de resultado. */
function Chip({
  label,
  value,
  strong,
}: {
  label: string
  value: React.ReactNode
  strong?: boolean
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-lg border bg-background px-2.5 py-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={`tabular-nums ${strong ? "text-base font-bold" : "text-sm font-semibold"}`}
      >
        {value}
      </span>
    </span>
  )
}

function Scenario({
  n,
  title,
  desc,
  children,
}: {
  n: number
  title: string
  desc: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
      <div>
        <p className="text-xs font-semibold">
          Cenário {n} — {title}
        </p>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
      {children}
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}
