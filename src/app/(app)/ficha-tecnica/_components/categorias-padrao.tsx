"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2, Tags, X } from "lucide-react"

import type { CategoriaItem } from "@/lib/data/categorias-item"

import { salvarCategoriasPadrao } from "../_actions"

/**
 * As categorias padrão da rede, editadas como texto — uma por linha.
 *
 * ── POR QUE UM TEXTÃO E NÃO UMA TABELA COM BOTÃO DE + ────────────────────
 * Quem abre isso está transcrevendo o cardápio: já tem a lista na cabeça ou
 * copiada de algum lugar e quer colar. Uma tabela com "adicionar categoria"
 * transformaria dez linhas em dez cliques. A ordem que ficar é a ordem que a
 * tela usa — o cardápio tem uma sequência natural (entrada, prato, bebida,
 * sobremesa) que ordenar em ordem alfabética destrói.
 */
export function CategoriasPadrao({
  categorias,
}: {
  categorias: CategoriaItem[]
}) {
  const router = useRouter()
  const [aberto, setAberto] = React.useState(false)
  const [texto, setTexto] = React.useState(
    categorias.map((c) => c.nome).join("\n"),
  )
  const [salvando, setSalvando] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)
  const [ok, setOk] = React.useState(false)

  async function salvar() {
    setSalvando(true)
    setErro(null)
    const r = await salvarCategoriasPadrao(texto.split("\n"))
    setSalvando(false)
    if (!r.ok) {
      setErro(r.erro ?? "Não deu para salvar.")
      return
    }
    setOk(true)
    setTimeout(() => setOk(false), 2000)
    router.refresh()
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/5"
      >
        <Tags className="size-3.5" />
        Categorias
        {categorias.length > 0 && (
          <span className="font-normal opacity-70">({categorias.length})</span>
        )}
      </button>
    )
  }

  return (
    <div className="w-full rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-bold">
            <Tags className="size-4 text-primary" />
            Categorias padrão
          </h2>
          <p className="mt-0.5 max-w-xl text-[12px] leading-relaxed text-muted-foreground">
            Uma por linha, na ordem que você quer ver. Elas passam a ser
            sugeridas em <b>todas as lojas</b> — é o que evita a mesma coisa
            virar &quot;Bebidas&quot; numa loja e &quot;Bebida&quot; na outra.
          </p>
        </div>
        <button
          onClick={() => setAberto(false)}
          className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          aria-label="Fechar"
        >
          <X className="size-4" />
        </button>
      </div>

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={8}
        placeholder={"Churrasco\nAcompanhamentos\nBebidas\nSobremesas\nCombos"}
        className="mt-3 w-full rounded-lg border bg-background px-3 py-2 font-mono text-[13px] leading-relaxed outline-none focus:border-ring"
      />

      {erro && <p className="mt-2 text-xs font-medium text-rose-600">{erro}</p>}

      <div className="mt-2.5 flex items-center gap-2">
        <button
          onClick={salvar}
          disabled={salvando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {salvando ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          {ok ? "Salvo" : "Salvar categorias"}
        </button>
        <p className="text-[11px] text-muted-foreground">
          Tirar uma categoria daqui não tira ela dos itens que já a usam — some
          só da lista de sugestões.
        </p>
      </div>
    </div>
  )
}
