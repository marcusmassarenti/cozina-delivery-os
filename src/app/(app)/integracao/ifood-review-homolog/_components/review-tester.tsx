"use client"

import * as React from "react"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  probeAll,
  probeReply,
  probeReviewDetail,
  probeReviews,
  probeSummary,
  type ReviewProbeState,
} from "../_actions"

const SANDBOX = "500f2b4d-1807-4a9c-9e7d-93e87c128891"

type Action = (prev: ReviewProbeState, fd: FormData) => Promise<ReviewProbeState>

export function ReviewTester() {
  const [merchantId, setMerchantId] = React.useState(SANDBOX)
  const [reviewId, setReviewId] = React.useState("")
  const [text, setText] = React.useState(
    "Obrigado pela avaliação! Ficamos felizes que gostou. 🙌",
  )
  const [result, setResult] = React.useState<ReviewProbeState | null>(null)
  const [activeLabel, setActiveLabel] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

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
      {/* Loja de teste */}
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

      {/* Botões de critério */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run("Listar (página 1 + addCount)", probeReviews)}
        >
          Listar + contagem
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run("Rodar tudo (paginação completa)", probeAll)}
        >
          Rodar tudo
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run("Summary", probeSummary)}
        >
          Summary
        </Button>
      </div>

      {/* Review específico */}
      <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
        <label className="text-xs font-medium text-muted-foreground">
          reviewId (pegue de &quot;Listar&quot;)
        </label>
        <input
          value={reviewId}
          onChange={(e) => setReviewId(e.target.value)}
          placeholder="cole o id de uma avaliação"
          className="w-full rounded-md border bg-background px-3 py-1.5 font-mono text-xs"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !reviewId}
            onClick={() => run("Detalhe", probeReviewDetail, { reviewId })}
          >
            Detalhe
          </Button>
        </div>
        <label className="mt-1 text-xs font-medium text-muted-foreground">
          Resposta (só funciona em NOT_REPLIED)
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          className="w-full rounded-md border bg-background px-3 py-1.5 text-xs"
        />
        <div>
          <Button
            size="sm"
            disabled={pending || !reviewId}
            onClick={() => run("Responder", probeReply, { reviewId, text })}
          >
            Responder avaliação
          </Button>
        </div>
      </div>

      {/* Resultado */}
      {pending && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Rodando {activeLabel}…
        </p>
      )}
      {result && !pending && (
        <div
          className={`rounded-md border p-3 text-xs ${
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
              </li>
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
                  (clique pra usar acima)
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
  )
}
