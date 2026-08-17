"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Check, Copy, Loader2, Search } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import type { ItemCusto, ResumoCusto } from "@/lib/data/custo-itens"

import {
  aplicarCustoEmLote,
  salvarCategoriaItem,
  salvarCustoItem,
} from "../../_actions"

/**
 * A bancada: uma linha por item vendido, custo digitado direto nela.
 *
 * ── AS DECISÕES QUE FAZEM ISSO SER RÁPIDO ────────────────────────────────
 * • Grava ao SAIR do campo, não num botão. Quem preenche cem linhas não pode
 *   perder tudo por fechar a aba antes de salvar.
 * • Enter pula pro próximo campo vazio, não pro próximo da lista: depois de
 *   preencher a linha 3, o trabalho está na 4, não em revisitar a 1.
 * • A ordem é a receita e não muda enquanto se digita. Reordenar a lista
 *   embaixo de quem está preenchendo é a forma mais rápida de perder o lugar.
 * • Quando um custo é salvo e existem linhas parecidas sem custo, aparece a
 *   oferta de aplicar nelas — com a lista à vista. É o substituto do de-para
 *   automático, que a gente mediu e não funciona (ver migration 0212).
 */
export function BancadaCusto({
  unitId,
  lojaNome,
  resumo,
}: {
  unitId: string
  lojaNome: string
  resumo: ResumoCusto
}) {
  const router = useRouter()
  const [busca, setBusca] = React.useState("")
  const [soSemCusto, setSoSemCusto] = React.useState(false)
  const [plataforma, setPlataforma] = React.useState<string>("")
  const [categoria, setCategoria] = React.useState<string>("")
  const [salvando, setSalvando] = React.useState<string | null>(null)
  const [erro, setErro] = React.useState<string | null>(null)
  const [oferta, setOferta] = React.useState<{
    custo: number
    precoBase: number
    alvos: ItemCusto[]
    /** Chaves marcadas. Começa só com as de preço parecido — ver `semelhantes`. */
    marcados: Set<string>
  } | null>(null)

  // O que foi digitado nesta sessão, antes do servidor devolver. Sem isso o
  // campo "pisca" de volta pro valor antigo entre o blur e o refresh.
  const [local, setLocal] = React.useState<Record<string, string>>({})

  /**
   * Último valor já mandado por linha.
   *
   * ⚠️ Existe porque Enter e blur disparam os dois na sequência: aperta Enter,
   * grava, o campo perde o foco e o blur tentaria gravar o mesmo valor de novo.
   * A prop `item.custo` ainda é a antiga nesse instante (o refresh não voltou),
   * então a checagem "mudou?" não pega. Um ref e não estado: mudar isso não
   * deve redesenhar a tabela no meio da digitação.
   */
  const enviado = React.useRef<Record<string, number | null>>({})

  const chave = (i: ItemCusto) => `${i.platform}|${i.nomeItem}`

  const plataformasComItem = React.useMemo(
    () => [...new Set(resumo.itens.map((i) => i.platform))],
    [resumo.itens],
  )

  const visiveis = React.useMemo(() => {
    const q = normalizar(busca)
    return resumo.itens.filter((i) => {
      if (soSemCusto && i.custo !== null) return false
      if (plataforma && i.platform !== plataforma) return false
      if (categoria === "__sem__" && i.categoria) return false
      if (categoria && categoria !== "__sem__" && i.categoria !== categoria)
        return false
      if (q && !normalizar(i.nomeItem).includes(q)) return false
      return true
    })
  }, [resumo.itens, busca, soSemCusto, plataforma, categoria])

  async function salvar(item: ItemCusto, texto: string) {
    const k = chave(item)
    const limpo = texto.trim().replace(/\./g, "").replace(",", ".")
    const valor = limpo === "" ? null : Number(limpo)

    if (valor !== null && (!Number.isFinite(valor) || valor < 0)) {
      setErro(`Custo inválido em "${item.nomeItem}".`)
      return
    }
    // Não vai ao servidor se não mudou nada — sair do campo sem digitar é o
    // gesto mais comum da tela. `enviado` cobre o intervalo em que o servidor
    // ainda não devolveu e `item.custo` está velho (Enter seguido de blur).
    const jaEnviado = k in enviado.current ? enviado.current[k] : item.custo
    if (valor === jaEnviado) return
    enviado.current[k] = valor

    setErro(null)
    setSalvando(k)
    const r = await salvarCustoItem({
      unitId,
      platform: item.platform,
      nomeItem: item.nomeItem,
      custo: valor,
    })
    setSalvando(null)

    if (!r.ok) {
      setErro(r.erro ?? "Não deu para salvar.")
      return
    }

    if (valor !== null) {
      const parecidos = semelhantes(item, resumo.itens)
      if (parecidos.length > 0) {
        setOferta({
          custo: valor,
          precoBase: item.precoMedio,
          alvos: parecidos,
          // Só o que tem preço perto do original já vem marcado. "Prato
          // Galera" e "Proteína em Dobro" casam por nome e são porções
          // maiores — o custo delas NÃO é o mesmo.
          marcados: new Set(
            parecidos
              .filter((a) => precoParecido(item.precoMedio, a.precoMedio))
              .map((a) => chave(a)),
          ),
        })
      }
    }
    router.refresh()
  }

  async function aplicarLote() {
    if (!oferta) return
    const escolhidos = oferta.alvos.filter((a) => oferta.marcados.has(chave(a)))
    if (escolhidos.length === 0) {
      setOferta(null)
      return
    }
    setSalvando("lote")
    const r = await aplicarCustoEmLote({
      unitId,
      custo: oferta.custo,
      alvos: escolhidos.map((a) => ({
        platform: a.platform,
        nomeItem: a.nomeItem,
      })),
    })
    setSalvando(null)
    setOferta(null)
    if (!r.ok) setErro(r.erro ?? "Não deu.")
    else router.refresh()
  }

  /**
   * Enter salva e pula pro próximo campo AINDA VAZIO.
   *
   * ⚠️ Grava direto em vez de só chamar `blur()` e deixar o `onBlur` fazer.
   * A primeira versão fazia isso e o Enter simplesmente não salvava — o blur
   * disparado por código nem sempre chega ao handler do React. Salvar aqui é
   * explícito e não depende de efeito colateral do foco.
   */
  function aoTeclar(
    e: React.KeyboardEvent<HTMLInputElement>,
    item: ItemCusto,
    idx: number,
  ) {
    if (e.key !== "Enter") return
    e.preventDefault()

    const k = chave(item)
    void salvar(item, e.currentTarget.value)
    setLocal((p) => {
      const n = { ...p }
      delete n[k]
      return n
    })

    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>("input[data-custo]"),
    )
    const proximo =
      inputs.slice(idx + 1).find((el) => el.value.trim() === "") ??
      inputs[idx + 1]
    proximo?.focus()
    proximo?.select()
  }

  const pct = Math.round(resumo.cobertura * 100)

  return (
    <div className="flex flex-col gap-3">
      {/* ── Cobertura ─────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="text-sm font-semibold">{lojaNome}</span>
          <div className="relative h-1.5 min-w-[160px] flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-sm font-bold tabular-nums text-emerald-600">
            {pct}% da receita
          </span>
          {resumo.faltamPara90 > 0 ? (
            <span className="text-xs text-muted-foreground">
              faltam {resumo.faltamPara90}{" "}
              {resumo.faltamPara90 === 1 ? "linha" : "linhas"} pra 90%
            </span>
          ) : (
            resumo.receitaTotal > 0 && (
              <span className="text-xs font-medium text-emerald-600">
                cobertura suficiente
              </span>
            )
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-4">
          <Kpi rot="Receita no mês" val={fmtBRL(resumo.receitaTotal)} />
          <Kpi rot="Com custo preenchido" val={fmtBRL(resumo.receitaComCusto)} />
          <Kpi
            rot="Lucro bruto do mês"
            val={fmtBRL(resumo.lucroMes)}
            forte
            aviso={resumo.cobertura < 0.999}
          />
          <Kpi rot="Itens vendidos" val={fmtNum(resumo.itens.length)} />
        </div>
        {resumo.cobertura < 0.999 && resumo.receitaTotal > 0 && (
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            O lucro acima soma <b>só as linhas que já têm custo</b> — hoje {pct}%
            da receita. Não é o lucro da loja inteira enquanto essa barra não
            fechar.
          </p>
        )}
      </div>

      {/* ── Oferta de aplicar em lote ─────────────────────────────── */}
      {oferta && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-3.5">
          <p className="text-sm font-semibold">
            Aplicar {fmtBRL(oferta.custo)} em outras linhas?
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            Estes nomes parecem a mesma comida. Os de{" "}
            <b>preço muito diferente</b> vêm desmarcados — costumam ser porção
            maior (&quot;prato galera&quot;, &quot;proteína em dobro&quot;), e
            aí o custo não é o mesmo.
          </p>
          <ul className="mt-2 space-y-1">
            {oferta.alvos.map((a) => {
              const k = chave(a)
              const marcado = oferta.marcados.has(k)
              return (
                <li key={k}>
                  <label className="flex cursor-pointer items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={(e) =>
                        setOferta((p) => {
                          if (!p) return p
                          const s = new Set(p.marcados)
                          if (e.target.checked) s.add(k)
                          else s.delete(k)
                          return { ...p, marcados: s }
                        })
                      }
                      className="size-3.5 accent-primary"
                    />
                    <PlatformLogo platform={a.platform} size="sm" />
                    <span className={marcado ? "" : "text-muted-foreground"}>
                      {a.nomeItem}
                    </span>
                    <span
                      className={
                        precoParecido(oferta.precoBase, a.precoMedio)
                          ? "ml-auto text-[11px] tabular-nums text-muted-foreground"
                          : "ml-auto text-[11px] font-semibold tabular-nums text-amber-600"
                      }
                    >
                      {fmtBRL(a.precoMedio)}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              onClick={aplicarLote}
              disabled={salvando === "lote"}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {salvando === "lote" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Copy className="size-3.5" />
              )}
              Aplicar em {oferta.marcados.size}
            </button>
            <button
              onClick={() => setOferta(null)}
              className="px-2 text-xs text-muted-foreground"
            >
              Agora não
            </button>
          </div>
        </div>
      )}

      {erro && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 dark:bg-rose-950">
          {erro}
        </p>
      )}

      {/* ── Filtros ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar item…"
            className="h-9 w-56 rounded-lg border bg-background pl-8 pr-3 text-sm outline-none focus:border-ring"
          />
        </div>
        {/* Só as plataformas que ESTE mês tem: chip sem item por trás é um
            filtro que só sabe devolver tela vazia. */}
        {plataformasComItem.length > 1 && (
          <div className="flex items-center gap-1">
            {plataformasComItem.map((p) => (
              <button
                key={p}
                onClick={() => setPlataforma(plataforma === p ? "" : p)}
                title={p}
                className={
                  plataforma === p
                    ? "rounded-lg border border-primary bg-primary/10 px-2 py-1.5"
                    : "rounded-lg border px-2 py-1.5 opacity-60 hover:opacity-100"
                }
              >
                <PlatformLogo platform={p} size="sm" />
              </button>
            ))}
          </div>
        )}

        {resumo.categorias.length > 0 && (
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="h-9 rounded-lg border bg-background px-2.5 text-xs outline-none focus:border-ring"
            aria-label="Categoria"
          >
            <option value="">Todas as categorias</option>
            {resumo.categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="__sem__">Sem categoria</option>
          </select>
        )}

        <label className="flex cursor-pointer items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={soSemCusto}
            onChange={(e) => setSoSemCusto(e.target.checked)}
            className="size-3.5 accent-primary"
          />
          Só os que faltam
        </label>
        <span className="text-xs text-muted-foreground">
          {visiveis.length} de {resumo.itens.length}
        </span>
      </div>

      {/* ── A lista ───────────────────────────────────────────────── */}
      {resumo.itens.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhum item vendido neste mês para esta loja.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          {/* Autocompletar com o que já existe: evita "Bebidas", "bebidas" e
              "Bebida" virarem três categorias na mesma loja. */}
          <datalist id="ft-categorias">
            {resumo.categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-medium">Item</th>
                <th className="px-3 py-2.5 text-left font-medium">Categoria</th>
                <th className="px-3 py-2.5 text-right font-medium">
                  Receita no mês
                </th>
                <th className="px-3 py-2.5 text-right font-medium">Preço</th>
                <th className="px-3 py-2.5 text-right font-medium">Custo</th>
                <th className="px-3 py-2.5 text-right font-medium">Taxas</th>
                <th className="px-3 py-2.5 text-right font-medium">
                  Lucro bruto
                </th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((i, idx) => {
                const k = chave(i)
                const valor =
                  local[k] ??
                  (i.custo === null
                    ? ""
                    : String(i.custo).replace(".", ","))
                return (
                  <tr
                    key={k}
                    className="border-b last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <PlatformLogo platform={i.platform} size="sm" />
                        <span className="font-medium">{i.nomeItem}</span>
                      </div>
                      <span className="ml-6 text-[11px] text-muted-foreground">
                        {fmtNum(i.qtd)} un
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        list="ft-categorias"
                        defaultValue={i.categoria ?? ""}
                        placeholder="—"
                        onBlur={(e) => {
                          const v = e.target.value.trim()
                          if (v === (i.categoria ?? "")) return
                          void salvarCategoriaItem({
                            unitId,
                            platform: i.platform,
                            nomeItem: i.nomeItem,
                            categoria: v,
                          }).then((r) => {
                            if (r.ok) router.refresh()
                            else setErro(r.erro ?? "Não deu.")
                          })
                        }}
                        className="w-28 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-xs outline-none hover:border-border focus:border-ring"
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtBRL(i.receita)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {fmtBRL(i.precoMedio)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {salvando === k && (
                          <Loader2 className="size-3 animate-spin text-muted-foreground" />
                        )}
                        {salvando !== k && i.custo !== null && (
                          <Check className="size-3 text-emerald-600" />
                        )}
                        <input
                          data-custo
                          inputMode="decimal"
                          value={valor}
                          placeholder="0,00"
                          onChange={(e) =>
                            setLocal((p) => ({ ...p, [k]: e.target.value }))
                          }
                          onKeyDown={(e) => aoTeclar(e, i, idx)}
                          onBlur={(e) => {
                            void salvar(i, e.target.value)
                            setLocal((p) => {
                              const n = { ...p }
                              delete n[k]
                              return n
                            })
                          }}
                          className="w-20 rounded-md border bg-background px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-ring"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {i.taxaPct > 0 ? (
                        <>
                          {fmtBRL(i.taxaValor)}
                          <span className="ml-1 text-[10.5px] opacity-70">
                            {fmtPct(i.taxaPct * 100, 1)}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {i.lucro === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <>
                          <span
                            className={
                              i.lucro >= 0
                                ? "font-semibold text-emerald-600"
                                : "font-semibold text-rose-600"
                            }
                          >
                            {fmtBRL(i.lucro)}
                          </span>
                          <span className="ml-1 text-[10.5px] text-muted-foreground">
                            {fmtPct((i.lucroPct ?? 0) * 100, 1)}
                          </span>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── De onde vêm os percentuais ────────────────────────────── */}
      <div className="rounded-xl border bg-card p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Comissão medida no extrato desta loja
        </p>
        <div className="mt-2 flex flex-col gap-1.5">
          {(
            Object.entries(resumo.taxaPorPlataforma) as [
              keyof typeof resumo.taxaPorPlataforma,
              (typeof resumo.taxaPorPlataforma)[keyof typeof resumo.taxaPorPlataforma],
            ][]
          )
            .filter(([, t]) => t.temDado)
            .map(([p, t]) => (
              <div key={p} className="flex items-center gap-2 text-xs">
                <PlatformLogo platform={p} size="sm" />
                <span className="font-semibold tabular-nums">
                  {fmtPct(t.comissaoPct * 100, 1)}
                </span>
                <span className="text-muted-foreground">de comissão</span>
                {t.cargaTotalPct > t.comissaoPct + 0.005 && (
                  <span className="text-muted-foreground">
                    · a plataforma reteve{" "}
                    {fmtPct(t.cargaTotalPct * 100, 1)} no total do mês, contando
                    entrega e promoção
                  </span>
                )}
              </div>
            ))}
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        <b>Preço</b> é a receita dividida pela quantidade — já com a promoção
        descontada. <b>Taxas</b> é só a <b>comissão</b>, que é percentual sobre o
        valor do item e por isso cabe nele. Entrega, taxa de serviço, anúncio e
        mensalidade são cobrados por pedido ou por mês: ficam no DRE da loja, não
        aqui. <b>Lucro bruto</b> é preço − comissão − custo.
      </p>
    </div>
  )
}

function Kpi({
  rot,
  val,
  forte = false,
  aviso = false,
}: {
  rot: string
  val: string
  forte?: boolean
  aviso?: boolean
}) {
  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
        {rot}
        {aviso && <span className="ml-1 text-amber-600">parcial</span>}
      </p>
      <p
        className={
          forte
            ? "text-lg font-bold tabular-nums text-emerald-600"
            : "text-lg font-semibold tabular-nums"
        }
      >
        {val}
      </p>
    </div>
  )
}

/**
 * Preços perto o bastante pra ser a mesma porção.
 *
 * ⚠️ Nasceu de um erro visto na tela: "Sobrecoxa Desossada Defumada" casou por
 * nome com "…Prato Galera", "…Proteína em Dobro" e "…Maior quantidade", que são
 * porções maiores e custam mais. O nome não distingue; o preço sim.
 *
 * 15% é folga pra diferença de preço entre plataformas do MESMO prato (que
 * existe e é normal) sem alcançar uma porção dobrada.
 */
function precoParecido(a: number, b: number): boolean {
  if (a <= 0 || b <= 0) return false
  return Math.abs(a - b) / Math.max(a, b) <= 0.15
}

/** Sem acento, sem pontuação, sem selo de marketing. */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/\b(mais pedido|top\s*five|novo|promocional|promocao)\b/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Linhas SEM custo que provavelmente são a mesma comida.
 *
 * Casa por nome normalizado igual ou por um conter o outro — é o que pega
 * "Sobrecoxa Desossada Defumada" e "Churrasco de Sobrecoxa Desossada
 * Defumada", que é o caso real entre Keeta, 99 e iFood da mesma loja.
 *
 * ⚠️ Exige 12 caracteres pra aceitar "um contém o outro". Sem isso, "Coca"
 * casaria com metade do cardápio e a oferta viraria uma armadilha.
 */
function semelhantes(base: ItemCusto, todos: ItemCusto[]): ItemCusto[] {
  const a = normalizar(base.nomeItem)
  if (a.length < 6) return []
  return todos.filter((o) => {
    if (o.custo !== null) return false
    if (o.platform === base.platform && o.nomeItem === base.nomeItem) return false
    const b = normalizar(o.nomeItem)
    if (a === b) return true
    if (a.length >= 12 && b.includes(a)) return true
    if (b.length >= 12 && a.includes(b)) return true
    return false
  })
}
