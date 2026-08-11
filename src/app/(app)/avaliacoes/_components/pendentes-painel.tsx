"use client"

import { useState } from "react"
import { ChevronDown, Clock, MessageSquareWarning } from "lucide-react"

/**
 * Casca do "Esperando resposta": fechada por padrão, abre no clique.
 *
 * A lista aberta empurrava a tela de Avaliações inteira pra baixo — com 13
 * pendentes já eram várias rolagens antes do primeiro gráfico. Fechada, o
 * bloco é uma linha: quantas faltam, em quantas lojas e quantas vencem hoje.
 *
 * A contagem fica na CASCA (não dentro da lista) justamente pra continuar
 * visível com o bloco fechado — se sumisse junto, ninguém saberia que há algo
 * a fazer.
 */
export function PendentesPainel({
  total,
  lojas,
  vencendoHoje,
  prazoDias,
  children,
}: {
  total: number
  lojas: number
  vencendoHoje: number
  prazoDias: number
  children: React.ReactNode
}) {
  const [aberto, setAberto] = useState(false)

  return (
    <section className="rounded-xl border bg-card shadow-sm" data-print="hide">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full flex-wrap items-center gap-2 px-5 py-3 text-left hover:bg-muted/50"
      >
        <MessageSquareWarning className="size-4 shrink-0 text-amber-600" />
        <h2 className="text-sm font-semibold">Esperando resposta</h2>
        <span className="text-[11px] text-muted-foreground">
          {total} avaliaç{total === 1 ? "ão" : "ões"} em {lojas} loja
          {lojas === 1 ? "" : "s"}
        </span>
        {vencendoHoje > 0 && (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
            {vencendoHoje} no último dia
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="hidden items-center gap-1 sm:flex">
            <Clock className="size-3" />
            {prazoDias} dias de prazo
          </span>
          <span className="font-medium text-foreground">
            {aberto ? "Fechar" : "Responder"}
          </span>
          <ChevronDown
            className={`size-4 transition-transform ${aberto ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {aberto && <div className="border-t">{children}</div>}
    </section>
  )
}
