"use client"

import * as React from "react"
import { Loader2, Percent, Tags, Wallet, X } from "lucide-react"

import { fmtBRL } from "@/lib/format"
import type { ItemCusto } from "@/lib/data/custo-itens"

/**
 * A barra flutuante de ações em massa — aparece quando há linha marcada.
 *
 * ── AS TRÊS AÇÕES, E POR QUE SÃO ESSAS ───────────────────────────────────
 * • Categoria — classificar trinta bebidas de uma vez é o caso mais óbvio.
 * • Custo fixo — itens que custam o mesmo (todo refrigerante lata).
 * • Custo como % do preço — o atalho que realmente destrava o preenchimento.
 *   Quem não tem ficha detalhada sabe dizer "minha carne fica em torno de 35%
 *   do preço de venda", e isso já dá uma margem utilizável em trinta linhas
 *   num clique. É aproximação e a tela diz isso; aproximação que existe vale
 *   mais que exatidão que ninguém cadastrou.
 *
 * ⚠️ A barra mostra o resultado ANTES de aplicar (o intervalo de custo que vai
 * ser gravado). Ação em massa que só diz "30 itens" pede um Ctrl+Z que não
 * existe aqui.
 */
export function BarraMassa({
  selecionados,
  categorias,
  ocupado,
  onLimpar,
  onAplicar,
}: {
  selecionados: ItemCusto[]
  categorias: string[]
  ocupado: boolean
  onLimpar: () => void
  onAplicar: (input: {
    categoria?: string | null
    custo?: number | null
    custoPctPreco?: number | null
  }) => void
}) {
  const [aba, setAba] = React.useState<"categoria" | "custo" | "pct" | null>(
    null,
  )
  const [cat, setCat] = React.useState("")
  const [custo, setCusto] = React.useState("")
  const [pct, setPct] = React.useState("")

  if (selecionados.length === 0) return null

  const num = (s: string) => {
    const v = Number(s.trim().replace(/\./g, "").replace(",", "."))
    return Number.isFinite(v) ? v : null
  }

  const pctNum = num(pct)
  const previa =
    pctNum !== null && pctNum >= 0
      ? (() => {
          const vs = selecionados.map((i) => i.precoMedio * (pctNum / 100))
          return { min: Math.min(...vs), max: Math.max(...vs) }
        })()
      : null

  const botao = (
    id: "categoria" | "custo" | "pct",
    Icone: typeof Tags,
    texto: string,
  ) => (
    <button
      onClick={() => setAba(aba === id ? null : id)}
      className={
        aba === id
          ? "inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground"
          : "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"
      }
    >
      <Icone className="size-3.5" />
      {texto}
    </button>
  )

  return (
    <div
      data-print="hide"
      className="sticky bottom-4 z-20 mx-auto w-fit max-w-full rounded-xl border bg-card p-2 shadow-lg"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="px-2 text-xs font-bold tabular-nums">
          {selecionados.length}{" "}
          {selecionados.length === 1 ? "selecionado" : "selecionados"}
        </span>
        <span className="h-4 w-px bg-border" />
        {botao("categoria", Tags, "Categoria")}
        {botao("custo", Wallet, "Custo")}
        {botao("pct", Percent, "Custo = % do preço")}
        <button
          onClick={onLimpar}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
          Limpar
        </button>
      </div>

      {aba === "categoria" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
          <input
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            placeholder="Digite ou escolha"
            list="massa-cats"
            className="h-8 w-44 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
          />
          <datalist id="massa-cats">
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {categorias.slice(0, 5).map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className="rounded-md border px-2 py-1 text-[11px] hover:bg-muted"
            >
              {c}
            </button>
          ))}
          <Aplicar
            ocupado={ocupado}
            onClick={() => onAplicar({ categoria: cat.trim() || null })}
          />
        </div>
      )}

      {aba === "custo" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
          <input
            value={custo}
            onChange={(e) => setCusto(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            className="h-8 w-24 rounded-md border bg-background px-2 text-right text-xs tabular-nums outline-none focus:border-ring"
          />
          <span className="text-[11px] text-muted-foreground">
            em cada um dos {selecionados.length}
          </span>
          <Aplicar
            ocupado={ocupado}
            desabilitado={num(custo) === null || (num(custo) as number) < 0}
            onClick={() => onAplicar({ custo: num(custo) })}
          />
        </div>
      )}

      {aba === "pct" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
          <input
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            inputMode="decimal"
            placeholder="35"
            className="h-8 w-16 rounded-md border bg-background px-2 text-right text-xs tabular-nums outline-none focus:border-ring"
          />
          <span className="text-[11px] text-muted-foreground">
            % do preço de cada item
          </span>
          {previa && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              → custo de {fmtBRL(previa.min)} a {fmtBRL(previa.max)}
            </span>
          )}
          <Aplicar
            ocupado={ocupado}
            desabilitado={pctNum === null || pctNum < 0 || pctNum > 100}
            onClick={() => onAplicar({ custoPctPreco: pctNum })}
          />
        </div>
      )}
    </div>
  )
}

function Aplicar({
  ocupado,
  desabilitado,
  onClick,
}: {
  ocupado: boolean
  desabilitado?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={ocupado || desabilitado}
      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
    >
      {ocupado && <Loader2 className="size-3.5 animate-spin" />}
      Aplicar
    </button>
  )
}
