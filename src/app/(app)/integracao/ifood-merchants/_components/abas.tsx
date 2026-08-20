"use client"

import * as React from "react"
import { Search, X } from "lucide-react"

/**
 * As três perguntas desta tela, separadas.
 *
 * Antes era uma pilha só: aviso de lojas sumidas, fila de solicitações,
 * merchants sem vínculo, merchants conectados por cliente e ignoradas. Cada
 * bloco respondia uma pergunta diferente e todos disputavam o mesmo espaço.
 * Com 10 clientes e 200 lojas, o que precisa de ação hoje ficava enterrado
 * embaixo do que só serve pra consulta ocasional.
 *
 *   • Pendências — o que precisa de mim. É onde a tela abre.
 *   • Conectadas — quem já está funcionando. Consulta, não trabalho.
 *   • Ignoradas — o arquivo morto, que existe só pra não voltar sozinho.
 *
 * A busca fica FORA das abas de propósito: procurar "Faisão" e não achar
 * porque a loja está na outra aba seria pior que a pilha original. Ela filtra
 * as três ao mesmo tempo e mostra em qual aba está cada resultado.
 */

export type Aba = "pendencias" | "conectadas" | "ignoradas"

const TOM: Record<Aba, string> = {
  pendencias:
    "data-[ativo=true]:border-amber-500 data-[ativo=true]:text-amber-700 dark:data-[ativo=true]:text-amber-400",
  conectadas:
    "data-[ativo=true]:border-emerald-500 data-[ativo=true]:text-emerald-700 dark:data-[ativo=true]:text-emerald-400",
  ignoradas:
    "data-[ativo=true]:border-muted-foreground data-[ativo=true]:text-foreground",
}

const ROTULO: Record<Aba, string> = {
  pendencias: "Pendências",
  conectadas: "Conectadas",
  ignoradas: "Ignoradas",
}

export function Abas({
  contagens,
  children,
  /**
   * Quais abas existem. O 99 e o Cardápio Web não têm "ignoradas" — lá não há
   * merchant solto pra arquivar —, e aba com zero permanente é ruído: ensina a
   * pessoa a ignorar a régua de abas inteira.
   */
  abas = ["pendencias", "conectadas", "ignoradas"],
  placeholder = "Loja, CNPJ, cliente ou razão social",
}: {
  contagens: Partial<Record<Aba, number>>
  /** Recebe a aba ativa e o texto da busca (minúsculo, sem acento). */
  children: (aba: Aba, busca: string) => React.ReactNode
  abas?: Aba[]
  placeholder?: string
}) {
  const [aba, setAba] = React.useState<Aba>(abas[0] ?? "pendencias")
  const [busca, setBusca] = React.useState("")

  const normalizada = React.useMemo(() => normalizar(busca), [busca])

  const itens = abas.map((id) => ({ id, rotulo: ROTULO[id], tom: TOM[id] }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2 border-b">
        {itens.map((i) => (
          <button
            key={i.id}
            type="button"
            data-ativo={aba === i.id}
            onClick={() => setAba(i.id)}
            className={`-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground ${i.tom}`}
          >
            {i.rotulo}
            <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
              {contagens[i.id] ?? 0}
            </span>
          </button>
        ))}

        {/* Busca colada nas abas: é o mesmo controle mental — "onde está a
            loja X" e "o que falta fazer" são a mesma pergunta com escopos
            diferentes. */}
        <div className="relative ml-auto w-full max-w-xs py-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-md border bg-background py-1.5 pl-8 pr-7 text-xs outline-none placeholder:text-muted-foreground focus:border-ring"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca("")}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {children(aba, normalizada)}
    </div>
  )
}

/**
 * Texto comparável: minúsculo, sem acento e sem pontuação.
 *
 * Sem tirar a pontuação, buscar "35.890.669/0001-80" não acharia o CNPJ que a
 * gente guarda só com dígitos — e é EXATAMENTE assim, formatado, que ele vem
 * quando você copia do Portal do Desenvolvedor.
 */
export function normalizar(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "")
}

/** Casa a busca contra vários campos da loja de uma vez. */
export function combina(busca: string, ...campos: (string | null | undefined)[]): boolean {
  if (!busca) return true
  return campos.some((c) => normalizar(c).includes(busca))
}
