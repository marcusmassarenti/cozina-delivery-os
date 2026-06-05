import { MessageCircle, Star, ThumbsDown, ThumbsUp } from "lucide-react"

import {
  getAvaliacoesResumoForMonth,
  listAvaliacoesForMonth,
} from "@/lib/data/ifood-imported"
import { fmtNum, fmtPct } from "@/lib/format"
import { PaginatedList } from "@/components/shared/paginated-list"

export async function AvaliacoesTab({
  unitId,
  year,
  month,
  notasFiltro = [],
}: {
  unitId: string
  year: number
  month: number
  /** Filtra a lista de comentários por nota (ex: [1,2]). Vazio = todas. */
  notasFiltro?: number[]
}) {
  const [resumo, lista] = await Promise.all([
    getAvaliacoesResumoForMonth(unitId, year, month),
    // Limite alto = mês inteiro da loja (cabe bem abaixo do cap de 1000). Antes
    // era 50: o header "Comentários (N)" e o filtro de nota rodavam só sobre os
    // 50 mais recentes e subestimavam vs o KPI "Com comentário" (mês todo).
    listAvaliacoesForMonth(unitId, year, month, { limit: 1000 }),
  ])
  const listaFiltrada =
    notasFiltro.length > 0
      ? lista.filter((a) => notasFiltro.includes(a.nota))
      : lista
  const notasLabel =
    notasFiltro.length > 0
      ? `só notas ${[...notasFiltro].sort((a, b) => a - b).join(", ")}★`
      : null

  if (!resumo.hasData) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-10 text-center">
        <p className="text-sm font-medium">Sem avaliações importadas</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Sobe o relatório &quot;Comentários e avaliações&quot; do iFood em{" "}
          <a href="/importacao" className="underline">
            /importacao
          </a>{" "}
          pra ver notas, tags e comentários reais.
        </p>
      </div>
    )
  }

  // % por nota
  const pct = (n: 1 | 2 | 3 | 4 | 5) =>
    resumo.total > 0 ? (resumo.distribucao[n] / resumo.total) * 100 : 0

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiBig
          label="Nota Média"
          value={
            <span className="flex items-baseline gap-1">
              {resumo.notaMedia.toFixed(2)}
              <Star className="size-5 fill-amber-400 stroke-amber-400" />
            </span>
          }
          hint={`${resumo.total} avaliações no mês`}
        />
        <KpiBig
          label="5 estrelas"
          value={`${fmtPct(pct(5))}`}
          hint={`${resumo.distribucao[5]} avaliações`}
          tone="positive"
        />
        <KpiBig
          label="Negativas (1-2★)"
          value={`${fmtPct(pct(1) + pct(2))}`}
          hint={`${resumo.distribucao[1] + resumo.distribucao[2]} avaliações`}
          tone={pct(1) + pct(2) > 5 ? "negative" : "neutral"}
        />
        <KpiBig
          label="Com comentário"
          value={`${fmtPct((resumo.comComentario / resumo.total) * 100)}`}
          hint={`${resumo.comComentario} de ${resumo.total}`}
        />
      </div>

      {/* Distribuição de notas */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold">Distribuição das notas</h3>
        <div className="space-y-2">
          {([5, 4, 3, 2, 1] as const).map((n) => (
            <NotaBar
              key={n}
              nota={n}
              count={resumo.distribucao[n]}
              pct={pct(n)}
            />
          ))}
        </div>
      </div>

      {/* Tags positivas + negativas */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <ThumbsUp className="size-4 text-emerald-600" />
            <h3 className="text-sm font-semibold">O que elogiam</h3>
          </div>
          {resumo.topTagsPositivas.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhuma tag positiva marcada
            </p>
          ) : (
            <div className="space-y-1.5">
              {resumo.topTagsPositivas.map((t) => (
                <TagRow
                  key={t.tag}
                  tag={t.tag}
                  count={t.count}
                  total={resumo.total}
                  positive
                />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <ThumbsDown className="size-4 text-rose-600" />
            <h3 className="text-sm font-semibold">O que reclamam</h3>
          </div>
          {resumo.topTagsNegativas.length === 0 ? (
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              🎉 Nenhuma tag negativa neste mês!
            </p>
          ) : (
            <div className="space-y-1.5">
              {resumo.topTagsNegativas.map((t) => (
                <TagRow
                  key={t.tag}
                  tag={t.tag}
                  count={t.count}
                  total={resumo.total}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lista de avaliações com comentário (ou todas se nenhuma tem) */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center gap-2 border-b px-5 py-3">
          <MessageCircle className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">
            Comentários ({listaFiltrada.filter((a) => a.comentario).length})
          </h3>
          {notasLabel && (
            <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
              {notasLabel}
            </span>
          )}
        </div>
        {listaFiltrada.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {notasLabel
              ? `Nenhuma avaliação com ${notasLabel} neste mês`
              : "Sem avaliações neste mês"}
          </div>
        ) : (
          <PaginatedList
            items={listaFiltrada.map((a) => (
              <AvaliacaoCard key={a.id} avaliacao={a} />
            ))}
            pageSize={10}
            className="divide-y"
          />
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────

function KpiBig({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: React.ReactNode
  hint: string
  tone?: "positive" | "negative" | "neutral"
}) {
  const accent =
    tone === "positive"
      ? "border-l-4 border-l-emerald-500"
      : tone === "negative"
        ? "border-l-4 border-l-rose-500"
        : ""
  return (
    <div className={`rounded-xl border bg-card p-4 shadow-sm ${accent}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  )
}

function NotaBar({
  nota,
  count,
  pct,
}: {
  nota: number
  count: number
  pct: number
}) {
  const color =
    nota >= 4 ? "bg-emerald-500" : nota === 3 ? "bg-amber-500" : "bg-rose-500"
  return (
    <div className="flex items-center gap-3">
      <div className="flex w-12 items-center gap-0.5 text-xs font-semibold tabular-nums">
        {nota}
        <Star className="size-3 fill-amber-400 stroke-amber-400" />
      </div>
      <div className="flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-2.5 ${color}`}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
      <div className="w-24 text-right text-xs tabular-nums">
        <span className="font-semibold">{fmtNum(count)}</span>
        <span className="ml-1 text-muted-foreground">({pct.toFixed(1)}%)</span>
      </div>
    </div>
  )
}

function TagRow({
  tag,
  count,
  total,
  positive,
}: {
  tag: string
  count: number
  total: number
  positive?: boolean
}) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <span className="flex-1 truncate text-xs">{tag}</span>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${positive ? "bg-emerald-500" : "bg-rose-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs font-semibold tabular-nums">
        {count}
      </span>
    </div>
  )
}

function AvaliacaoCard({
  avaliacao,
}: {
  avaliacao: {
    pedidoIdCurto: string | null
    dataAvaliacao: string
    nota: number
    comentario: string | null
    tagsPositivas: string[]
    tagsNegativas: string[]
    statusAvaliacao: string | null
  }
}) {
  const stars = []
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <Star
        key={i}
        className={`size-3.5 ${
          i <= avaliacao.nota
            ? "fill-amber-400 stroke-amber-400"
            : "stroke-muted-foreground/40"
        }`}
      />,
    )
  }
  const dataAvalFormatted = new Date(
    avaliacao.dataAvaliacao + "T00:00:00",
  ).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5">{stars}</div>
          {avaliacao.pedidoIdCurto && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              #{avaliacao.pedidoIdCurto}
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {dataAvalFormatted}
        </span>
      </div>
      {avaliacao.comentario && (
        <p className="mt-2 text-sm italic text-foreground/90">
          &ldquo;{avaliacao.comentario}&rdquo;
        </p>
      )}
      {(avaliacao.tagsPositivas.length > 0 ||
        avaliacao.tagsNegativas.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {avaliacao.tagsPositivas.map((t) => (
            <span
              key={`+${t}`}
              className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
            >
              ✓ {t}
            </span>
          ))}
          {avaliacao.tagsNegativas.map((t) => (
            <span
              key={`-${t}`}
              className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-950/30 dark:text-rose-400"
            >
              ✗ {t}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
