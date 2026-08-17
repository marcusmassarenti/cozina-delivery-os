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
   * Janelas de iFood de tamanhos diferentes na mesma tela.
   *
   * ⚠️ Isto é o que fazia a Jardins parecer a maior loja da rede: ela mostrava
   * 30 dias e as vizinhas, 8. Comparar as colunas sem dizer isso é comparar
   * coisas diferentes com a mesma cara.
   */
  const janelasDesiguais = React.useMemo(() => {
    const ds = [
      ...new Set(
        lojas.map((l) => l.janelaIfoodDias).filter((d): d is number => !!d),
      ),
    ].sort((a, b) => a - b)
    return ds.length > 1 ? { min: ds[0], max: ds[ds.length - 1] } : null
  }, [lojas])

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
            {lojas.filter((l) => l.receita > 0).length} lojas prontas
          </span>
        </div>
      </div>

      {lacunas.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 dark:border-amber-900 dark:bg-amber-950">
          <p className="text-[12.5px] font-semibold text-amber-900 dark:text-amber-200">
            Falta o relatório de itens de{" "}
            {lacunas.map(([p], i) => (
              <span key={p}>
                {i > 0 ? (i === lacunas.length - 1 ? " e " : ", ") : ""}
                {NOME_PLATAFORMA[p] ?? p}
                <span className="font-normal">
                  {" "}
                  ({lacunas[i][1]} {lacunas[i][1] === 1 ? "loja" : "lojas"})
                </span>
              </span>
            ))}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">
            Essas lojas <b>venderam</b> nessas plataformas neste mês, mas o
            relatório que abre a venda item a item não entrou — no iFood ele vem
            de planilha, não pela API. Sem ele, o custo desses itens não tem
            onde ser preenchido e a receita deles fica fora da conta.{" "}
            <Link
              href="/importacao"
              className="font-semibold underline underline-offset-2"
            >
              Importar relatórios
            </Link>
          </p>
        </div>
      )}

      {janelasDesiguais && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 dark:border-amber-900 dark:bg-amber-950">
          <p className="text-[12.5px] font-semibold text-amber-900 dark:text-amber-200">
            As lojas não estão mostrando o mesmo número de dias de iFood
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">
            O relatório de Cardápio do iFood é exportado à mão, com um período
            escolhido na hora — e aqui ele varia de{" "}
            <b>{janelasDesiguais.min} a {janelasDesiguais.max} dias</b> conforme
            a loja. Uma loja com mais dias aparece com mais itens e mais
            receita <b>sem vender mais</b>. O número de dias de cada uma está na
            coluna Plataformas.
          </p>
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
                    {l.janelaIfoodDias !== null && (
                      <span
                        title="Dias que o relatório de Cardápio do iFood cobre neste mês"
                        className={
                          janelasDesiguais &&
                          l.janelaIfoodDias < janelasDesiguais.max
                            ? "ml-0.5 rounded bg-amber-100 px-1 py-0.5 font-mono text-[9.5px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                            : "ml-0.5 rounded bg-muted px-1 py-0.5 font-mono text-[9.5px] text-muted-foreground"
                        }
                      >
                        {l.janelaIfoodDias}d
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {l.itens > 0 ? fmtNum(l.itens) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {l.receita > 0 ? fmtBRL(l.receita) : "—"}
                </td>
                <td className="px-3 py-2.5">
                  {l.receita > 0 ? (
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
        <b>Lucro bruto</b> é preço − comissão da plataforma − custo, somando só
        os itens que já têm custo preenchido. Enquanto a barra não fecha, o
        número vem marcado como <b>parcial</b> — ele cresce conforme você
        preenche.
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

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
}
