"use client"

import * as React from "react"
import { Check, ChevronDown, Search } from "lucide-react"

export type OpcaoBusca = { id: string; rotulo: string; detalhe?: string }

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()

/**
 * Escolher UM item de uma lista, digitando.
 *
 * ── PREMISSA DO PROJETO (Marcus, 28/08/26) ──────────────────────────────
 * "Sempre colocar como premissa escrever ao escolher cliente." Todo seletor
 * de loja/cliente/pessoa deste sistema aceita busca. A DG FOODS tem 75 lojas
 * com nomes que se repetem — "Santo Peixe - Comida Japonesa", "Suki Temakeria
 * - Comida Japonesa", "Kawaii Poke - Comida Japonesa" — e num `<select>`
 * nativo achar a certa é rolar uma lista de 75 linhas quase idênticas. A
 * Prime tem 380.
 *
 * Irmão do `SeletorLojas` dos relatórios, que resolve o caso de VÁRIAS. Este
 * resolve o de UMA e funciona dentro de `<form>`: guarda o valor num input
 * escondido, então a server action lê pelo `name` como leria de um `<select>`.
 *
 * Busca por rótulo E por detalhe (o código da loja): quem sabe o número
 * digita o número.
 */
export function SeletorBusca({
  name,
  opcoes,
  valorInicial = "",
  placeholder = "Escolha…",
  vazio = "Nenhum",
  obrigatorio = false,
  onChange,
}: {
  name: string
  opcoes: OpcaoBusca[]
  valorInicial?: string
  placeholder?: string
  /** Rótulo da opção "nenhum". `null` remove a opção (campo obrigatório). */
  vazio?: string | null
  obrigatorio?: boolean
  onChange?: (id: string) => void
}) {
  const [valor, setValor] = React.useState(valorInicial)
  const [aberto, setAberto] = React.useState(false)
  const [busca, setBusca] = React.useState("")
  const caixa = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) {
        setAberto(false)
        // Fechar limpa a busca: reabrir com o filtro de ontem faz a lista
        // parecer incompleta e ninguém lembra que digitou.
        setBusca("")
      }
    }
    document.addEventListener("mousedown", fora)
    return () => document.removeEventListener("mousedown", fora)
  }, [aberto])

  const q = normalizar(busca)
  const filtradas = q
    ? opcoes.filter((o) => normalizar(`${o.detalhe ?? ""} ${o.rotulo}`).includes(q))
    : opcoes

  const escolhida = opcoes.find((o) => o.id === valor)

  const escolher = (id: string) => {
    setValor(id)
    setAberto(false)
    setBusca("")
    onChange?.(id)
  }

  return (
    <div ref={caixa} className="relative">
      <input type="hidden" name={name} value={valor} />
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className={`flex h-8 w-full items-center gap-1.5 rounded-md border bg-background px-2 text-left text-xs outline-none focus:border-ring ${
          obrigatorio && !valor ? "border-rose-300 dark:border-rose-900" : ""
        }`}
      >
        <span className={`min-w-0 flex-1 truncate ${escolhida ? "" : "text-muted-foreground"}`}>
          {escolhida
            ? `${escolhida.detalhe ? `${escolhida.detalhe} — ` : ""}${escolhida.rotulo}`
            : placeholder}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </button>

      {aberto && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[240px] overflow-hidden rounded-lg border bg-popover shadow-xl">
          {/* O campo fica FORA da área que rola: junto da lista, rolar até a
              40ª loja tira o campo da tela e o texto digitado some de vista. */}
          <div className="relative border-b">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Digite para buscar…"
              className="h-9 w-full bg-transparent pl-8 pr-2 text-xs outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {vazio !== null && !busca && (
              <Linha
                marcada={valor === ""}
                onClick={() => escolher("")}
                texto={vazio}
                esmaecido
              />
            )}
            {filtradas.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                Nada encontrado para “{busca}”.
              </p>
            ) : (
              filtradas.map((o) => (
                <Linha
                  key={o.id}
                  marcada={o.id === valor}
                  onClick={() => escolher(o.id)}
                  texto={o.detalhe ? `${o.detalhe} — ${o.rotulo}` : o.rotulo}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Linha({
  marcada,
  onClick,
  texto,
  esmaecido,
}: {
  marcada: boolean
  onClick: () => void
  texto: string
  esmaecido?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted ${
        marcada ? "bg-muted font-medium" : ""
      } ${esmaecido ? "text-muted-foreground" : ""}`}
    >
      <Check className={`size-3 shrink-0 ${marcada ? "" : "invisible"}`} />
      <span className="min-w-0 flex-1 truncate">{texto}</span>
    </button>
  )
}
