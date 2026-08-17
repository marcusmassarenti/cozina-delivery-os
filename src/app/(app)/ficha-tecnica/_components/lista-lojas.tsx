"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronRight, Search } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import type { LojaCusto } from "@/lib/data/custo-itens"

/**
 * A lista de lojas da Ficha Técnica — a porta de entrada.
 *
 * Mostra, antes de escolher, o que decide qual loja abrir: quanto da receita
 * dela já tem custo e qual margem os itens preenchidos estão dando. Ordenada
 * por receita, que é a ordem em que vale a pena trabalhar.
 *
 * A busca filtra POR DIGITAÇÃO e no cliente. São dezenas ou centenas de linhas,
 * já carregadas — ir ao servidor a cada tecla deixaria mais lento sem ganhar
 * nada. Com nome, código e cidade no mesmo campo, igual Unidades.
 */
export function ListaLojas({
  lojas,
  receitaRede,
  cobertaRede,
  periodoQuery,
}: {
  lojas: LojaCusto[]
  receitaRede: number
  cobertaRede: number
  periodoQuery: string
}) {
  const [busca, setBusca] = React.useState("")
  const [soFaltando, setSoFaltando] = React.useState(false)

  const visiveis = React.useMemo(() => {
    const q = normalizar(busca)
    return lojas.filter((l) => {
      if (soFaltando && l.cobertura >= 0.9) return false
      if (!q) return true
      return (
        normalizar(l.nome).includes(q) ||
        normalizar(l.codigo).includes(q) ||
        normalizar(l.cidade ?? "").includes(q)
      )
    })
  }, [lojas, busca, soFaltando])

  const pctRede = receitaRede > 0 ? cobertaRede / receitaRede : 0

  /**
   * Plataformas que faturaram mas não trouxeram item, e em quantas lojas.
   *
   * Vira faixa no topo porque é a diferença entre "a tela quebrou" e "falta
   * subir um relatório" — e sem ela a primeira leitura é sempre a errada.
   */
  /**
   * A janela que a MAIORIA das lojas tem.
   *
   * ⚠️ Existe porque a primeira versão carimbava a data em toda linha e o
   * Marcus disse que poluiu — com razão: treze lojas repetindo "27/07–04/08 ·
   * inclui outro mês" é a mesma informação treze vezes. O que discrimina é a
   * EXCEÇÃO. Então a regra comum sobe pro aviso, uma vez, e a linha só carimba
   * quem foge dela.
   */
  const janelaComum = React.useMemo(() => {
    const contagem = new Map<string, { n: number; l: LojaCusto }>()
    for (const l of lojas) {
      if (!l.janelaIfood) continue
      const k = `${l.janelaIfood.inicio}|${l.janelaIfood.fim}`
      const atual = contagem.get(k)
      contagem.set(k, { n: (atual?.n ?? 0) + 1, l })
    }
    let melhor: { n: number; l: LojaCusto } | null = null
    for (const v of contagem.values()) {
      if (!melhor || v.n > melhor.n) melhor = v
    }
    return melhor && melhor.n > 1 ? melhor : null
  }, [lojas])

  const foraDoMes = lojas.filter((l) => l.janelaForaDoMes).length
  const fogemDaComum = lojas.filter(
    (l) =>
      l.janelaIfood &&
      janelaComum &&
      (l.janelaIfood.inicio !== janelaComum.l.janelaIfood!.inicio ||
        l.janelaIfood.fim !== janelaComum.l.janelaIfood!.fim),
  ).length

  const lacunas = React.useMemo(() => {
    const m = new Map<string, number>()
    for (const l of lojas) {
      for (const p of l.semItens) m.set(p, (m.get(p) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [lojas])
  const href = (l: LojaCusto) =>
    `/ficha-tecnica/${encodeURIComponent(l.codigo)}${periodoQuery ? `?periodo=${periodoQuery}` : ""}`

  return (
    <div className="flex flex-col gap-3">
      {/* ── Rede ──────────────────────────────────────────────────── */}
      <div data-tour="ft-rede" className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="text-sm font-semibold">Toda a rede</span>
          <div className="relative h-1.5 min-w-[160px] flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 transition-all"
              style={{ width: `${Math.round(pctRede * 100)}%` }}
            />
          </div>
          <span className="text-sm font-bold tabular-nums text-emerald-600">
            {Math.round(pctRede * 100)}% da receita com custo
          </span>
          <span className="text-xs text-muted-foreground">
            {lojas.filter((l) => l.cobertura >= 0.9).length} de{" "}
            {lojas.filter((l) => l.receitaItens > 0).length} lojas prontas
          </span>
        </div>
      </div>

      {/* ── UM aviso só ───────────────────────────────────────────
          Eram dois (relatório faltando + janelas diferentes) e o Marcus disse
          que ficava confuso e parecia desorganizado. São o mesmo assunto: o
          relatório de itens do iFood e da Keeta é manual, então ora falta, ora
          vem com período diferente. Uma frase por problema, no mesmo lugar. */}
      {(lacunas.length > 0 || janelaComum) && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 dark:border-amber-900 dark:bg-amber-950">
          <p className="text-[12.5px] font-semibold text-amber-900 dark:text-amber-200">
            Falta relatório de itens em algumas lojas
          </p>
          <ul className="mt-1 space-y-0.5 text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">
            {lacunas.map(([p, n]) => (
              <li key={p}>
                <b>
                  {n} {n === 1 ? "loja" : "lojas"}
                </b>{" "}
                venderam no {NOME_PLATAFORMA[p] ?? p} e não têm itens no mês.
              </li>
            ))}
            {janelaComum && (
              <li>
                Os itens do iFood vêm do relatório de{" "}
                <b>
                  {dm(janelaComum.l.janelaIfood!.inicio)} a{" "}
                  {dm(janelaComum.l.janelaIfood!.fim)}
                </b>{" "}
                na maioria das lojas — a coluna Receita é o mês inteiro, então a
                barra de custo preenchido não chega a 100% enquanto o relatório
                cobrir menos dias.
                {fogemDaComum > 0 && (
                  <>
                    {" "}
                    {fogemDaComum}{" "}
                    {fogemDaComum === 1 ? "loja tem" : "lojas têm"} período
                    diferente, marcado na linha.
                  </>
                )}
              </li>
            )}

          </ul>
          <Link
            href="/importacao"
            className="mt-1.5 inline-block text-[12px] font-semibold underline underline-offset-2 text-amber-900 dark:text-amber-200"
          >
            Importar relatórios
          </Link>
        </div>
      )}

      {/* ── Filtros ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, código ou cidade"
            className="h-9 w-64 rounded-lg border bg-background pl-8 pr-3 text-sm outline-none focus:border-ring"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={soFaltando}
            onChange={(e) => setSoFaltando(e.target.checked)}
            className="size-3.5 accent-primary"
          />
          Só as que faltam preencher
        </label>
        <span className="text-xs text-muted-foreground">
          {visiveis.length} de {lojas.length}
        </span>
      </div>

      {/* ── Tabela ────────────────────────────────────────────────── */}
      <div data-tour="ft-lista" className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Unidade</th>
              <th className="px-3 py-2.5 text-left font-medium">Plataformas</th>
              <th className="px-3 py-2.5 text-right font-medium">Itens</th>
              <th className="px-3 py-2.5 text-right font-medium">Receita</th>
              <th className="px-3 py-2.5 text-left font-medium">Custo preenchido</th>
              <th className="px-3 py-2.5 text-right font-medium">Lucro bruto</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr key={l.unitId} className="border-b last:border-0 hover:bg-muted/40">
                <td className="px-4 py-2.5">
                  <Link href={href(l)} className="flex items-center gap-2.5">
                    {l.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={l.logoUrl}
                        alt=""
                        className="size-7 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                        {l.codigo}
                      </span>
                    )}
                    <span>
                      <span className="block font-semibold">
                        {l.nome}
                        <span className="ml-1.5 font-mono text-[10.5px] font-normal tabular-nums text-muted-foreground">
                          #{l.codigo}
                        </span>
                      </span>
                      {l.cidade && (
                        <span className="block text-[11px] text-muted-foreground">
                          {l.cidade}
                        </span>
                      )}
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1">
                    {l.plataformas.length === 0 && l.semItens.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <>
                        {l.plataformas.map((p) => (
                          <PlatformLogo key={p} platform={p} size="sm" />
                        ))}
                        {/* Vendeu mas não trouxe item: aparece apagada, com o
                            motivo no title. Sumir seria dizer que não vendeu. */}
                        {l.semItens.map((p) => (
                          <span
                            key={p}
                            title="Vendeu neste mês, mas o relatório de itens desta plataforma não foi importado"
                            className="opacity-25 grayscale"
                          >
                            <PlatformLogo platform={p} size="sm" />
                          </span>
                        ))}
                      </>
                    )}
                    {/* Só a exceção ganha carimbo — a janela da maioria está
                        escrita no aviso, uma vez. */}
                    {l.janelaIfood &&
                      janelaComum &&
                      (l.janelaIfood.inicio !==
                        janelaComum.l.janelaIfood!.inicio ||
                        l.janelaIfood.fim !== janelaComum.l.janelaIfood!.fim) && (
                        <span
                          title={`O relatório do iFood desta loja cobre ${dm(l.janelaIfood.inicio)} a ${dm(l.janelaIfood.fim)}, diferente das demais`}
                          className="ml-0.5 rounded bg-amber-100 px-1 py-0.5 font-mono text-[9.5px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                        >
                          {dm(l.janelaIfood.inicio)}–{dm(l.janelaIfood.fim)}
                        </span>
                      )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {l.itens > 0 ? fmtNum(l.itens) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {l.receitaMes > 0 ? fmtBRL(l.receitaMes) : "—"}
                </td>
                <td className="px-3 py-2.5">
                  {l.receitaItens > 0 ? (
                    <div className="flex items-center gap-2">
                      <div className="relative h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <span
                          className={
                            l.cobertura >= 0.9
                              ? "absolute inset-y-0 left-0 rounded-full bg-emerald-500"
                              : "absolute inset-y-0 left-0 rounded-full bg-amber-500"
                          }
                          style={{ width: `${Math.round(l.cobertura * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {Math.round(l.cobertura * 100)}%
                      </span>
                    </div>
                  ) : l.semItens.length > 0 ? (
                    <span className="text-xs text-amber-600">
                      vendeu, sem relatório de itens
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      sem venda no mês
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {l.lucroMes === null ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <>
                      <span
                        className={
                          l.lucroMes >= 0
                            ? "font-semibold text-emerald-600"
                            : "font-semibold text-rose-600"
                        }
                      >
                        {fmtPct((l.lucroPct ?? 0) * 100, 1)}
                      </span>
                      <span className="block text-[10.5px] text-muted-foreground">
                        {fmtBRL(l.lucroMes)}
                        {l.cobertura < 0.9 ? " · parcial" : ""}
                      </span>
                    </>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Link
                    href={href(l)}
                    className="inline-flex items-center gap-0.5 text-xs font-medium text-primary"
                  >
                    Abrir
                    <ChevronRight className="size-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visiveis.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhuma loja encontrada.
        </p>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        <b>Receita</b> é o faturamento do mês, o mesmo do Dashboard.{" "}
        <b>Custo preenchido</b> mede sobre a receita dos itens do relatório, que
        pode cobrir um período menor que o mês. <b>Lucro bruto</b> é preço − o
        que a plataforma reteve − custo, somando só os itens que já têm custo —
        por isso vem marcado como <b>parcial</b> até a barra fechar.
      </p>
    </div>
  )
}

const NOME_PLATAFORMA: Record<string, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
  cardapioweb: "Cardápio Web",
}

/** Dia/mês curto — o ano está no seletor de período. */
function dm(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}`
}

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
}
