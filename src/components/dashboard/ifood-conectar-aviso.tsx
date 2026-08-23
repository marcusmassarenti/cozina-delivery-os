"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Plug, X } from "lucide-react"

import { fecharAviso } from "@/app/(app)/_actions-avisos"

/**
 * Faixa discreta na tela inicial pra quem ainda tem loja fora da API.
 *
 * Deliberadamente sem cor de alarme: não é erro, é oportunidade — e alarme
 * que não some vira ruído, a pessoa aprende a ignorar. O número é o argumento
 * ("9 de 49"), não o adjetivo.
 *
 * Só conta loja SEM pedido em aberto. Quem já pediu vê o outro aviso, o de
 * "falta aprovar no Portal do Parceiro".
 *
 * ── POR QUE ELE GANHOU X (Marcus, 22/08/26) ──────────────────────────────
 * Ele é oportunidade, não tarefa nossa: pode ser que o cliente NÃO queira
 * conectar aquelas lojas, e aí a faixa fica na tela dele pra sempre cobrando
 * uma decisão que ele já tomou. Faixa que não se consegue dispensar vira parte
 * do cenário, e deixa de ser lida junto com tudo o que estiver ao lado.
 *
 * A chave carrega a contagem: conectou uma, o aviso volta com o número novo —
 * quem dispensou com 8 fica sabendo quando virarem 9.
 */
export function IfoodConectarAviso({
  faltando,
  totalComIfood,
  fechados = [],
}: {
  faltando: number
  totalComIfood: number
  fechados?: string[]
}) {
  const [dispensado, setDispensado] = React.useState(false)
  const chave = `ifood-conectar|${faltando}`

  if (faltando === 0) return null
  if (dispensado || fechados.includes(`conexao-nova|${chave}`)) return null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card px-3 py-2 text-xs">
      <Link
        href="/conectar-ifood"
        className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 transition-colors hover:opacity-80"
      >
        <span className="inline-flex items-center gap-1.5 font-medium">
          <Plug className="size-3.5 text-muted-foreground" />
          {faltando} de {totalComIfood}{" "}
          {totalComIfood === 1 ? "loja" : "lojas"} do iFood ainda{" "}
          {faltando === 1 ? "depende" : "dependem"} de planilha
        </span>
        <span className="text-muted-foreground">
          Conectada, a loja traz faturamento, pedidos e avaliações sozinha todo
          dia.
        </span>
        <span className="ml-auto inline-flex items-center gap-1 font-medium text-primary">
          Conectar
          <ArrowRight className="size-3" />
        </span>
      </Link>
      <button
        type="button"
        onClick={() => {
          setDispensado(true)
          void fecharAviso(`conexao-nova|${chave}`)
        }}
        aria-label="Dispensar aviso"
        className="-mr-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
