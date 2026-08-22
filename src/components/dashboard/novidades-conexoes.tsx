"use client"

import * as React from "react"
import { ChevronDown, PartyPopper, X } from "lucide-react"

import { fecharAviso } from "@/app/(app)/_actions-avisos"

/**
 * Empacota as NOTÍCIAS de conexão numa linha só, que abre se a pessoa quiser.
 *
 * ── POR QUE (Marcus, 22/08/26) ───────────────────────────────────────────
 * O Churrasco Royal conectou sete lojas de uma vez e o Início virou uma pilha
 * de treze blocos. O problema não era cada aviso — era que eles competem pelo
 * mesmo espaço e o mesmo peso visual do que exige AÇÃO. Tela cheia de coisa
 * boa esconde a única coisa que precisava ser feita.
 *
 * Aqui entra só o que é NOTÍCIA: "sua loja conectou", "as avaliações
 * chegaram". Pendência ("falta aprovar no portal") fica de fora e continua
 * solta no topo, porque ela não é notícia — é tarefa.
 *
 * O corte em três é o mesmo do resto da casa: com uma ou duas, o aviso aberto
 * é a confirmação que a pessoa esperava; a partir daí vira lista.
 *
 * ⚠️ Recolher NÃO é dispensar. Cada aviso mantém o próprio X lá dentro, e o
 * bloco tem o seu — a pessoa fecha o que quiser, quando quiser, e o
 * fechamento vai pro banco (localStorage já falhou aqui: voltava a cada
 * aparelho novo).
 */
export function NovidadesConexoes({
  total,
  fechados = [],
  children,
}: {
  /** Quantas notícias estão aí dentro. Abaixo de 3 nem agrupa. */
  total: number
  fechados?: string[]
  children: React.ReactNode
}) {
  const chave = `novidades-conexoes|${total}`
  const [dispensado, setDispensado] = React.useState(false)
  const [aberto, setAberto] = React.useState(false)

  if (total === 0) return null
  // Uma ou duas: mostra do jeito que sempre foi.
  if (total < 3) return <>{children}</>
  if (dispensado || fechados.includes(`conexao-nova|${chave}`)) return null

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600/10">
          <PartyPopper className="size-4 text-emerald-700 dark:text-emerald-400" />
        </span>
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="text-sm font-semibold">
            {total} novidades nas suas conexões
          </span>
          <span className="text-[12.5px] text-muted-foreground">
            — lojas conectadas e primeiras avaliações
          </span>
          <ChevronDown
            className={`ml-auto size-4 shrink-0 text-muted-foreground transition-transform ${
              aberto ? "rotate-180" : ""
            }`}
          />
        </button>
        <button
          type="button"
          onClick={() => {
            setDispensado(true)
            void fecharAviso(`conexao-nova|${chave}`)
          }}
          aria-label="Dispensar todas as novidades"
          className="-mr-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      {aberto && (
        <div className="space-y-2 border-t p-3">{children}</div>
      )}
    </div>
  )
}
