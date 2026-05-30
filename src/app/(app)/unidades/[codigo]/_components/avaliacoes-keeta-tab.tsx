/**
 * Avaliações (Keeta) — espelha Avaliacoes99Tab, mas Keeta não exporta tags.
 * Dados vêm de keeta_pedidos (pontuacao_avaliacao, conteudo_avaliacao,
 * data_avaliacao). Só nota (1-5) + comentário livre.
 */
import { MessageCircle, Star } from "lucide-react"

import {
  getKeetaAvaliacoesResumoForMonth,
  listKeetaAvaliacoesForMonth,
} from "@/lib/data/keeta-imported"
import { fmtNum, fmtPct } from "@/lib/format"
import { PaginatedList } from "@/components/shared/paginated-list"

export async function AvaliacoesKeetaTab({
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
    getKeetaAvaliacoesResumoForMonth(unitId, year, month),
    listKeetaAvaliacoesForMonth(unitId, year, month, 50),
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
        <p className="text-sm font-medium">Sem avaliações Keeta nesse mês</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Sobe o relatório &quot;Pedidos&quot; do Keeta em{" "}
          <a href="/importacao" className="underline">/importacao</a>{" "}
          pra ver notas e comentários reais.
        </p>
      </div>
    )
  }

  const pct = (n: 1 | 2 | 3 | 4 | 5) =>
    resumo.total > 0 ? (resumo.distribucao[n] / resumo.total) * 100 : 0
  const negPct =
    resumo.total > 0
      ? ((resumo.distribucao[1] + resumo.distribucao[2]) / resumo.total) * 100
      : 0
  const comComentarioPct =
    resumo.total > 0 ? (resumo.comComentario / resumo.total) * 100 : 0

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
          value={fmtPct(pct(5))}
          hint={`${resumo.distribucao[5]} avaliações`}
          tone="positive"
        />
        <KpiBig
          label="Negativas (1-2★)"
          value={fmtPct(negPct)}
          hint={`${resumo.distribucao[1] + resumo.distribucao[2]} avaliações`}
          tone={negPct < 10 ? "positive" : "negative"}
        />
        <KpiBig
          label="Com comentário"
          value={fmtPct(comComentarioPct)}
          hint={`${resumo.comComentario} comentários`}
        />
      </div>

      {/* Distribuição */}
      <div className="rounded-xl border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Distribuição das notas</h3>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {resumo.total} no mês
          </span>
        </div>
        <div className="space-y-2">
          {([5, 4, 3, 2, 1] as const).map((n) => {
            const count = resumo.distribucao[n]
            const p = pct(n)
            const color =
              n >= 4 ? "bg-emerald-500" : n === 3 ? "bg-amber-500" : "bg-rose-500"
            return (
              <div key={n} className="flex items-center gap-2">
                <div className="flex w-10 items-center gap-0.5 text-xs font-semibold tabular-nums">
                  {n}
                  <Star className="size-3 fill-amber-400 stroke-amber-400" />
                </div>
                <div className="flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-2 ${color}`}
                    style={{ width: `${Math.max(2, p)}%` }}
                  />
                </div>
                <span className="w-16 text-right text-xs tabular-nums">
                  <span className="font-semibold">{fmtNum(count)}</span>
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    ({p.toFixed(0)}%)
                  </span>
                </span>
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          O Keeta não classifica avaliações por tags — só nota e comentário
          livre.
        </p>
      </div>

      {/* Lista de avaliações */}
      {(listaFiltrada.length > 0 || notasLabel) && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center gap-2 border-b px-5 py-3">
            <MessageCircle className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">
              {notasLabel
                ? `${listaFiltrada.length} avaliações`
                : `Últimas ${listaFiltrada.length} avaliações`}
            </h3>
            {notasLabel && (
              <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                {notasLabel}
              </span>
            )}
          </div>
          {listaFiltrada.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Nenhuma avaliação com {notasLabel} neste mês
            </p>
          ) : (
          <PaginatedList
            as="ul"
            className="divide-y"
            pageSize={10}
            items={listaFiltrada.map((a) => (
              <li key={a.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star
                          key={i}
                          className={`size-3 ${
                            i <= a.nota
                              ? "fill-amber-400 stroke-amber-400"
                              : "stroke-muted-foreground/40"
                          }`}
                        />
                      ))}
                    </div>
                    {a.pedidoIdCurto && (
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        #{a.pedidoIdCurto}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {a.dataAvaliacao
                      ? new Date(a.dataAvaliacao + "T00:00:00").toLocaleDateString(
                          "pt-BR",
                          { day: "2-digit", month: "short" },
                        )
                      : "—"}
                  </span>
                </div>
                {a.comentario && (
                  <p className="mt-1 text-sm italic text-foreground/90 line-clamp-3">
                    &ldquo;{a.comentario}&rdquo;
                  </p>
                )}
              </li>
            ))}
          />
          )}
        </div>
      )}
    </div>
  )
}

function KpiBig({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: React.ReactNode
  hint?: string
  tone?: "positive" | "negative"
}) {
  const valueColor =
    tone === "positive"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "negative"
        ? "text-rose-700 dark:text-rose-400"
        : "text-foreground"
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1.5 text-2xl font-bold tracking-tight ${valueColor}`}>
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}
