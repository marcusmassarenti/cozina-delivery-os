/**
 * Avaliações (99 Food) — espelha AvaliacoesTab do iFood.
 * Dados vêm de ninefood_pedidos (campos data_avaliacao, nivel_avaliacao,
 * conteudo_avaliacao, tag_avaliacao).
 *
 * Diferenças vs iFood:
 *  - Tags não vêm classificadas (pos/neg) — classifico por nota: ≥4 positivas, ≤2 negativas
 *  - Mostro o badge "cliente novo" quando qtd_pedidos_anteriores = 0
 */
import { MessageCircle, Sparkles, Star, ThumbsDown, ThumbsUp } from "lucide-react"

import {
  getNinefoodAvaliacoesResumoForMonth,
  listNinefoodAvaliacoesForMonth,
} from "@/lib/data/ninefood-imported"
import { fmtNum, fmtPct } from "@/lib/format"

export async function Avaliacoes99Tab({
  unitId,
  year,
  month,
}: {
  unitId: string
  year: number
  month: number
}) {
  const [resumo, lista] = await Promise.all([
    getNinefoodAvaliacoesResumoForMonth(unitId, year, month),
    listNinefoodAvaliacoesForMonth(unitId, year, month, 50),
  ])

  if (!resumo.hasData) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-10 text-center">
        <p className="text-sm font-medium">Sem avaliações 99 Food nesse mês</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Sobe o relatório &quot;Dados do pedido&quot; do 99 Food em{" "}
          <a href="/importacao" className="underline">/importacao</a>{" "}
          pra ver notas, tags e comentários reais.
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

      {/* Distribuição + tags */}
      <div className="grid gap-4 lg:grid-cols-3">
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
        </div>

        {/* Tags positivas */}
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <ThumbsUp className="size-4 text-emerald-600" />
            <h3 className="text-sm font-semibold">O que elogiam</h3>
          </div>
          {resumo.topTagsPositivas.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Sem tags positivas registradas
            </p>
          ) : (
            <div className="space-y-1.5">
              {resumo.topTagsPositivas.map((t) => {
                const p =
                  resumo.total > 0 ? (t.count / resumo.total) * 100 : 0
                return (
                  <div key={t.tag} className="flex items-center gap-2">
                    <span className="flex-1 truncate text-xs">{t.tag}</span>
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${p}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-xs font-semibold tabular-nums">
                      {t.count}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Tags negativas */}
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <ThumbsDown className="size-4 text-rose-600" />
            <h3 className="text-sm font-semibold">O que reclamam</h3>
          </div>
          {resumo.topTagsNegativas.length === 0 ? (
            <p className="py-6 text-center text-xs font-medium text-emerald-700 dark:text-emerald-400">
              🎉 Sem reclamações registradas
            </p>
          ) : (
            <div className="space-y-1.5">
              {resumo.topTagsNegativas.map((t) => {
                const p =
                  resumo.total > 0 ? (t.count / resumo.total) * 100 : 0
                return (
                  <div key={t.tag} className="flex items-center gap-2">
                    <span className="flex-1 truncate text-xs">{t.tag}</span>
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-rose-500"
                        style={{ width: `${p}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-xs font-semibold tabular-nums">
                      {t.count}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Lista de avaliações */}
      {lista.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center gap-2 border-b px-5 py-3">
            <MessageCircle className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">
              Últimas {lista.length} avaliações
            </h3>
          </div>
          <ul className="divide-y">
            {lista.map((a) => (
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
                    {a.qtdPedidosAnteriores === 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-950/40 dark:text-blue-400">
                        <Sparkles className="size-2.5" />
                        cliente novo
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
                {a.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {a.tags.map((t) => {
                      const tone =
                        a.nota >= 4
                          ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
                          : a.nota <= 2
                            ? "bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-400"
                            : "bg-muted text-muted-foreground"
                      return (
                        <span
                          key={t}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}
                        >
                          {t}
                        </span>
                      )
                    })}
                  </div>
                )}
              </li>
            ))}
          </ul>
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
