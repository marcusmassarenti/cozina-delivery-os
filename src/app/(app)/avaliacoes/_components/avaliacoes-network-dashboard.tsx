import Link from "next/link"
import {
  ChevronRight,
  MessageCircle,
  Star,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import {
  getNetworkAvaliacoesForMonth,
} from "@/lib/data/ifood-imported"
import { getNetworkNinefoodAvaliacoesForMonth } from "@/lib/data/ninefood-imported"
import {
  getAvaliacoesByUnitForMonth,
} from "@/lib/data/avaliacoes-network"
import { getNetworkKeetaAvaliacoesForMonth } from "@/lib/data/keeta-imported"
import { fmtNum, fmtPct } from "@/lib/format"

/**
 * Dashboard de rede da tela /avaliacoes — visão padrão quando nenhuma
 * unidade está selecionada. Soma iFood + 99 Food + Keeta de todas as lojas.
 */
export async function AvaliacoesNetworkDashboard({
  year,
  month,
}: {
  year: number
  month: number
}) {
  const [ifood, nine, keeta, byUnit] = await Promise.all([
    getNetworkAvaliacoesForMonth(year, month),
    getNetworkNinefoodAvaliacoesForMonth(year, month),
    getNetworkKeetaAvaliacoesForMonth(year, month),
    getAvaliacoesByUnitForMonth(year, month),
  ])

  // ─── Combina as 3 plataformas ────────────────────────────────────
  const dist = {
    1: ifood.distribucao[1] + nine.distribucao[1] + keeta.distribucao[1],
    2: ifood.distribucao[2] + nine.distribucao[2] + keeta.distribucao[2],
    3: ifood.distribucao[3] + nine.distribucao[3] + keeta.distribucao[3],
    4: ifood.distribucao[4] + nine.distribucao[4] + keeta.distribucao[4],
    5: ifood.distribucao[5] + nine.distribucao[5] + keeta.distribucao[5],
  }
  const total = ifood.total + nine.total + keeta.total

  if (total === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-10 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
          <Star className="size-6 text-muted-foreground" />
        </div>
        <p className="mt-4 text-sm font-medium">
          Sem avaliações importadas neste mês
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Sobe os relatórios de avaliação do iFood, 99 Food ou Keeta em{" "}
          <a href="/importacao" className="underline">
            /importacao
          </a>{" "}
          pra ver a visão da rede aqui.
        </p>
      </div>
    )
  }

  const soma = 1 * dist[1] + 2 * dist[2] + 3 * dist[3] + 4 * dist[4] + 5 * dist[5]
  const notaMedia = total > 0 ? soma / total : 0
  const comComentario =
    ifood.comComentario + nine.comComentario + keeta.comComentario
  const pct = (n: 1 | 2 | 3 | 4 | 5) => (total > 0 ? (dist[n] / total) * 100 : 0)
  const negPct = pct(1) + pct(2)

  // Merge tags (soma counts por tag) das 2 plataformas
  const mergeTags = (
    a: Array<{ tag: string; count: number }>,
    b: Array<{ tag: string; count: number }>,
  ) => {
    const m = new Map<string, number>()
    for (const t of [...a, ...b]) m.set(t.tag, (m.get(t.tag) ?? 0) + t.count)
    return Array.from(m.entries())
      .sort((x, y) => y[1] - x[1])
      .slice(0, 8)
      .map(([tag, count]) => ({ tag, count }))
  }
  const tagsPos = mergeTags(ifood.topTagsPositivas, nine.topTagsPositivas)
  const tagsNeg = mergeTags(ifood.topTagsNegativas, nine.topTagsNegativas)

  // Merge comentários das 2 plataformas, ordenado por data
  type Coment = {
    id: string
    platform: PlatformId
    unitCode: string
    unitName: string
    nota: number
    comentario: string
    data: string
  }
  const comentarios: Coment[] = [
    ...ifood.ultimosComentarios.map((c) => ({
      id: "ifood-" + c.id,
      platform: "ifood" as const,
      unitCode: c.unitCode,
      unitName: c.unitName,
      nota: c.nota,
      comentario: c.comentario,
      data: c.data,
    })),
    ...nine.ultimosComentarios.map((c) => ({
      id: "99food-" + c.id,
      platform: "99food" as const,
      unitCode: c.unitCode,
      unitName: c.unitName,
      nota: c.nota,
      comentario: c.comentario,
      data: c.data,
    })),
    ...keeta.ultimosComentarios.map((c) => ({
      id: c.id,
      platform: "keeta" as const,
      unitCode: c.unitCode,
      unitName: c.unitName,
      nota: c.nota,
      comentario: c.comentario,
      data: c.data,
    })),
  ]
    .sort((a, b) => (a.data > b.data ? -1 : 1))
    .slice(0, 6)

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs combinados */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiBig
          label="Nota Média da Rede"
          value={
            <span className="flex items-baseline gap-1">
              {notaMedia.toFixed(2)}
              <Star className="size-5 fill-amber-400 stroke-amber-400" />
            </span>
          }
          hint={`${fmtNum(total)} avaliações · ${byUnit.length} unidades`}
        />
        <KpiBig
          label="5 estrelas"
          value={fmtPct(pct(5))}
          hint={`${fmtNum(dist[5])} avaliações`}
          tone="positive"
        />
        <KpiBig
          label="Negativas (1-2★)"
          value={fmtPct(negPct)}
          hint={`${fmtNum(dist[1] + dist[2])} avaliações`}
          tone={negPct > 5 ? "negative" : "neutral"}
        />
        <KpiBig
          label="Com comentário"
          value={fmtPct((comComentario / total) * 100)}
          hint={`${fmtNum(comComentario)} de ${fmtNum(total)}`}
        />
      </div>

      {/* Distribuição + Comparativo por plataforma */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold">
            Distribuição das notas · rede
          </h3>
          <div className="space-y-2">
            {([5, 4, 3, 2, 1] as const).map((n) => (
              <NotaBar key={n} nota={n} count={dist[n]} pct={pct(n)} />
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold">Por plataforma</h3>
          <div className="space-y-3">
            <PlatformStat
              platform="ifood"
              total={ifood.total}
              notaMedia={ifood.notaMedia}
            />
            <PlatformStat
              platform="99food"
              total={nine.total}
              notaMedia={nine.notaMedia}
            />
            <PlatformStat
              platform="keeta"
              total={keeta.total}
              notaMedia={keeta.notaMedia}
            />
          </div>
        </div>
      </div>

      {/* Tags positivas + negativas */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <ThumbsUp className="size-4 text-emerald-600" />
            <h3 className="text-sm font-semibold">O que elogiam · rede</h3>
          </div>
          {tagsPos.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhuma tag positiva registrada
            </p>
          ) : (
            <div className="space-y-1.5">
              {tagsPos.map((t) => (
                <TagRow
                  key={t.tag}
                  tag={t.tag}
                  count={t.count}
                  total={total}
                  positive
                />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <ThumbsDown className="size-4 text-rose-600" />
            <h3 className="text-sm font-semibold">O que reclamam · rede</h3>
          </div>
          {tagsNeg.length === 0 ? (
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              🎉 Nenhuma reclamação na rede neste mês!
            </p>
          ) : (
            <div className="space-y-1.5">
              {tagsNeg.map((t) => (
                <TagRow key={t.tag} tag={t.tag} count={t.count} total={total} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Ranking por unidade — clicável */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="text-sm font-semibold">Avaliações por unidade</h3>
          <span className="text-[10px] text-muted-foreground">
            clique pra ver o detalhe
          </span>
        </div>
        <div className="divide-y">
          {byUnit.map((u) => (
            <Link
              key={u.unitId}
              href={`/avaliacoes?unidade=${u.unitCode}`}
              className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/50"
            >
              <span className="inline-flex shrink-0 items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                #{u.unitCode}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {u.unitName}
              </span>
              <div className="hidden items-center gap-1 sm:flex">
                {u.totalIfood > 0 && <PlatformLogo platform="ifood" size="sm" />}
                {u.total99 > 0 && <PlatformLogo platform="99food" size="sm" />}
                {u.totalKeeta > 0 && (
                  <PlatformLogo platform="keeta" size="sm" />
                )}
              </div>
              <div className="w-20 shrink-0 text-right">
                <p className="text-xs tabular-nums text-muted-foreground">
                  {fmtNum(u.total)} aval.
                </p>
                {total > 0 && (
                  <p
                    className="text-[10px] tabular-nums text-muted-foreground/80"
                    title={`${fmtPct((u.total / total) * 100)} das avaliações da rede`}
                  >
                    {fmtPct((u.total / total) * 100)} do total
                  </p>
                )}
              </div>
              <span className="flex w-16 items-center justify-end gap-1 text-sm font-bold tabular-nums">
                {u.notaMedia.toFixed(2)}
                <Star className="size-3.5 fill-amber-400 stroke-amber-400" />
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </div>

      {/* Últimos comentários — merged */}
      {comentarios.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center gap-2 border-b px-5 py-3">
            <MessageCircle className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Últimos comentários · rede</h3>
            <span className="ml-auto text-[10px] text-muted-foreground">
              iFood + 99 Food
            </span>
          </div>
          <div className="divide-y">
            {comentarios.map((c) => (
              <div key={c.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <PlatformLogo platform={c.platform} size="sm" />
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star
                          key={i}
                          className={`size-3 ${
                            i <= c.nota
                              ? "fill-amber-400 stroke-amber-400"
                              : "stroke-muted-foreground/40"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-[11px] font-medium text-muted-foreground">
                      #{c.unitCode} {c.unitName}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {new Date(c.data + "T00:00:00").toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                </div>
                <p className="mt-1 text-sm italic text-foreground/90 line-clamp-2">
                  &ldquo;{c.comentario}&rdquo;
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
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

function PlatformStat({
  platform,
  total,
  notaMedia,
}: {
  platform: PlatformId
  total: number
  notaMedia: number
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
      <PlatformLogo platform={platform} size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold">
          {platform === "ifood"
            ? "iFood"
            : platform === "keeta"
              ? "Keeta"
              : "99 Food"}
        </p>
        <p className="text-[10px] text-muted-foreground tabular-nums">
          {fmtNum(total)} avaliações
        </p>
      </div>
      <span className="flex items-center gap-1 text-sm font-bold tabular-nums">
        {total > 0 ? notaMedia.toFixed(2) : "—"}
        {total > 0 && (
          <Star className="size-3.5 fill-amber-400 stroke-amber-400" />
        )}
      </span>
    </div>
  )
}
