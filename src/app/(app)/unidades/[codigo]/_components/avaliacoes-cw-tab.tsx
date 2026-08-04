import { Star } from "lucide-react"

import { getAvaliacoesCardapioWeb } from "@/lib/data/cardapioweb-avaliacoes"
import { fmtNum } from "@/lib/format"

/**
 * Aba Avaliações do Cardápio Web.
 *
 * O diferencial em relação ao iFood: as SUB-NOTAS. Cada avaliação pontua
 * atendimento, qualidade do produto, embalagem, tempo de entrega e
 * custo/benefício separadamente. Por isso as dimensões aparecem ordenadas da
 * PIOR pra melhor — a que está puxando a nota pra baixo é a informação que
 * leva a uma ação, e ela é que precisa estar no topo.
 */
export async function AvaliacoesCwTab({
  unitId,
  year,
  month,
}: {
  unitId: string
  year: number
  month: number
}) {
  const a = await getAvaliacoesCardapioWeb([unitId], year, month)

  if (!a.temDados) {
    return (
      <div className="rounded-xl border border-dashed bg-card/50 p-8 text-center">
        <Star className="mx-auto mb-3 size-6 text-muted-foreground" />
        <p className="text-sm font-medium">
          Nenhuma avaliação do Cardápio Web neste período.
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          As avaliações vêm sozinhas pela API, todo dia. Só o cliente que compra
          pelo canal próprio avalia por aqui.
        </p>
      </div>
    )
  }

  const notas = [5, 4, 3, 2, 1]
  const maxDist = Math.max(
    1,
    ...notas.map((n) => a.distribuicao[String(n)] ?? 0),
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Nota média
          </p>
          <p className="mt-1 flex items-baseline gap-1.5 text-2xl font-semibold tabular-nums">
            {a.media != null ? a.media.toFixed(2) : "—"}
            <Star className="size-4 fill-amber-400 text-amber-400" />
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {fmtNum(a.total)} avaliação{a.total === 1 ? "" : "ões"}
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm sm:col-span-2">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Distribuição
          </p>
          <div className="space-y-1">
            {notas.map((n) => {
              const qtd = a.distribuicao[String(n)] ?? 0
              return (
                <div key={n} className="flex items-center gap-2">
                  <span className="w-8 shrink-0 text-right text-xs tabular-nums">
                    {n} ★
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full ${n >= 4 ? "bg-emerald-500" : n === 3 ? "bg-amber-500" : "bg-rose-500"}`}
                      style={{ width: `${(qtd / maxDist) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {fmtNum(qtd)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {a.dimensoes.length > 0 && (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Nota por dimensão</h3>
            <span className="text-[11px] text-muted-foreground">
              da pior para a melhor
            </span>
          </div>
          <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
            O Cardápio Web pergunta cada item separado — é o que o iFood não
            dá. A primeira linha é a que está puxando a nota para baixo.
          </p>
          <div className="space-y-1.5">
            {a.dimensoes.map((d, idx) => (
              <div key={d.dimensao} className="flex items-center gap-2">
                <span className="w-4 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                  {idx + 1}
                </span>
                <span className="w-40 shrink-0 truncate text-xs" title={d.dimensao}>
                  {d.dimensao}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full ${d.media >= 4.5 ? "bg-emerald-500" : d.media >= 3.5 ? "bg-amber-500" : "bg-rose-500"}`}
                    style={{ width: `${(d.media / 5) * 100}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums">
                  {d.media.toFixed(2)}
                </span>
                <span className="w-14 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                  {fmtNum(d.respostas)} resp.
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {a.comentarios.length > 0 && (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Comentários</h3>
            <span className="text-[11px] text-muted-foreground">
              {fmtNum(a.comComentario)} de {fmtNum(a.total)} avaliações
            </span>
          </div>
          <div className="mt-3 space-y-3">
            {a.comentarios.map((c) => (
              <div key={c.reviewId} className="border-b pb-3 last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold tabular-nums">
                    {c.nota != null ? `${c.nota} ★` : "—"}
                  </span>
                  {c.criadoEm && (
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(c.criadoEm).toLocaleDateString("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                      })}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm">{c.comentario}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
