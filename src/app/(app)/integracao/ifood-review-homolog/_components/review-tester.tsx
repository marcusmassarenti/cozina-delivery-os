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

  function run(label: string, action: Action, extra?: Record<string, string>) {
    const fd = new FormData()
    fd.set("merchantId", merchantId)
    if (extra) for (const [k, v] of Object.entries(extra)) fd.set(k, v)
    setActiveLabel(label)
    startTransition(async () => {
      const r = await action({ ok: false }, fd)
      setResult(r)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Loja de teste (sandbox do app de teste) */}
      <div className="order-[-2] flex flex-col gap-1">
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
              run("Listar avaliações", probeReviews, { size, dateFrom, dateTo })
            }
          >
            Listar avaliações
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run("Teste de limite (pageSize=100 → deve dar 400)", probeOversizePage)
            }
          >
            Testar limite (&gt;50 → 400)
          </Button>
        </div>
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
            onClick={() => run("Detalhe da avaliação", probeReviewDetail, { reviewId })}
          >
            Ver detalhe
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run("Detalhe de ID inexistente", probeReviewDetail, {
                reviewId: FAKE_ID,
              })
            }
          >
            Testar ID inexistente
          </Button>
        </div>
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
            onClick={() => run("Responder avaliação", probeReply, { reviewId, text })}
          >
            Responder
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !reviewId}
            onClick={() =>
              run(
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
              run("Texto inválido: vazio → 400 esperado", probeReplyInvalid, {
                reviewId,
                text: "",
              })
            }
          >
            Texto vazio
          </Button>
        </div>
      </Scenario>

      {/* Extras (não exigidos pelo checklist, mas úteis) */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run("Rodar tudo (paginação completa)", probeAll)}
        >
          Rodar tudo
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run("Summary", probeSummary)}
        >
          Summary
        </Button>
      </div>

      {/* Resultado — posto no topo (order) pra ficar sempre visível ao clicar. */}
      <div className="order-[-1] flex flex-col gap-4 empty:hidden">
      {pending && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Rodando {activeLabel}…
        </p>
      )}
      {result && !pending && (
        <div
          className={`scroll-mt-4 rounded-md border p-3 text-xs ${
            result.ok
              ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20"
              : "border-rose-200 bg-rose-50/40 dark:border-rose-900/40 dark:bg-rose-950/20"
          }`}
        >
          <p className="flex items-center gap-1.5 font-medium">
            {result.ok ? (
              <CheckCircle2 className="size-4 text-emerald-600" />
            ) : (
              <XCircle className="size-4 text-rose-600" />
            )}
            {activeLabel} · HTTP {result.status ?? "—"}
          </p>

          {result.error && (
            <p className="mt-1 text-rose-700 dark:text-rose-400">{result.error}</p>
          )}

          {result.meta && (
            <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
              <li>
                total: <b>{result.meta.total ?? "—"}</b> · pageCount:{" "}
                <b>{result.meta.pageCount ?? "—"}</b> · nesta resposta:{" "}
                <b>{result.meta.count ?? 0}</b>
                {result.meta.sizeUsed != null && (
                  <> · size pedido: <b>{result.meta.sizeUsed}</b></>
                )}
              </li>
              {(result.meta.dateFrom || result.meta.dateTo) && (
                <li>
                  filtro de data:{" "}
                  <b>{result.meta.dateFrom ?? "—"}</b> →{" "}
                  <b>{result.meta.dateTo ?? "—"}</b>
                </li>
              )}
              <li>
                status presentes:{" "}
                <b>{result.meta.statuses?.join(", ") || "—"}</b>
              </li>
              <li>
                visibility:{" "}
                <b>{result.meta.visibilities?.join(", ") || "—"}</b> · tem
                respostas: <b>{result.meta.hasReplies ? "sim" : "não"}</b>
              </li>
              {result.meta.firstReviewId && (
                <li>
                  1º reviewId:{" "}
                  <button
                    type="button"
                    onClick={() => setReviewId(result.meta!.firstReviewId!)}
                    className="font-mono underline"
                  >
                    {result.meta.firstReviewId}
                  </button>{" "}
                  (clique pra usar no Cenário 2/3)
                </li>
              )}
            </ul>
          )}

          {result.raw && (
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-background/60 p-2 text-[10px] leading-relaxed">
              {result.raw}
            </pre>
          )}
        </div>
      )}
      </div>
    </div>
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
