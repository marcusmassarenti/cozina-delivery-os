"use client"

import * as React from "react"
import { PartyPopper, Star, X } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { fecharAviso } from "@/app/(app)/_actions-avisos"
import type {
  ConexaoNova,
  PrimeiraAvaliacao,
} from "@/lib/data/conexoes-novas"

const ROTULO = {
  ifood: "iFood",
  "99food": "99 Food",
  cardapioweb: "Cardápio Web",
} as const

/**
 * TODAS as novidades de conexão em UM aviso de três linhas.
 *
 * ── POR QUE (Marcus, 22/08/26) ───────────────────────────────────────────
 * O Churrasco Royal conectou oito lojas de uma vez. A primeira tentativa
 * agrupou por loja — o que resolveu a CR Poços, que aparecia três vezes (uma
 * por plataforma) — mas ainda produzia onze cards empilhados, cada um com
 * título, explicação e botão. "Polui demais a tela."
 *
 * A lição: quando o volume é grande, o NOME de cada loja deixa de ser
 * notícia. O que a pessoa precisa saber é "conectou, tá entrando sozinho, não
 * preciso fazer nada" — e isso cabe numa frase. Os nomes continuam ali, em
 * lista corrida, pra quem quiser conferir; deixam de ser oito blocos.
 *
 * Abaixo de três novidades vale o contrário: ali o nome É a informação que a
 * pessoa está esperando ver, e o card completo é a confirmação.
 *
 * ⚠️ O X fecha tudo de uma vez, e vai pro BANCO. Dispensar oito avisos um a um
 * é tarefa que ninguém faz — e aviso que não se consegue dispensar vira parte
 * do cenário, deixando de ser lido justamente quando algo importante aparecer.
 * localStorage já falhou aqui: voltava a cada aparelho novo.
 */
export function NovidadesConexoes({
  conexoes,
  avaliacoes,
  fechados = [],
}: {
  conexoes: ConexaoNova[]
  avaliacoes: PrimeiraAvaliacao[]
  fechados?: string[]
}) {
  const [dispensado, setDispensado] = React.useState(false)

  // Uma loja pode ter conectado em mais de uma plataforma: a notícia é a LOJA.
  const lojas = new Map<string, ConexaoNova[]>()
  for (const c of conexoes) {
    const atual = lojas.get(c.unitId) ?? []
    atual.push(c)
    lojas.set(c.unitId, atual)
  }

  const totalNovidades = lojas.size + (avaliacoes.length > 0 ? 1 : 0)
  if (totalNovidades === 0) return null

  const chave = `novidades|${lojas.size}|${avaliacoes.length}`
  if (dispensado || fechados.includes(`conexao-nova|${chave}`)) return null

  // Quantas lojas por plataforma — o resumo que substitui os títulos.
  const porPlataforma = new Map<ConexaoNova["plataforma"], number>()
  for (const [, plats] of lojas)
    for (const p of plats)
      porPlataforma.set(p.plataforma, (porPlataforma.get(p.plataforma) ?? 0) + 1)

  const nomes = [...lojas.values()].map(
    (g) => `${g[0].unitCode ? `${g[0].unitCode} · ` : ""}${g[0].unitName}`,
  )
  const comAvaliacao = avaliacoes.filter((a) => a.quantas > 0)
  const totalAvaliacoes = comAvaliacao.reduce((s, a) => s + a.quantas, 0)
  const algumSemDado = [...lojas.values()].some((g) =>
    g.some((p) => !p.temDado),
  )

  function fechar() {
    setDispensado(true)
    void fecharAviso(`conexao-nova|${chave}`)
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/40">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600/10">
        <PartyPopper className="size-4 text-emerald-700 dark:text-emerald-400" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
          <span>
            <b>{lojas.size}</b> {lojas.size === 1 ? "loja conectada" : "lojas conectadas"}! 🎉
          </span>
          {[...porPlataforma.entries()].map(([plat, n]) => (
            <span
              key={plat}
              className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 px-2 py-0.5 text-[11px] font-medium"
            >
              <PlatformLogo platform={plat} size="sm" />
              {ROTULO[plat]}
              {n > 1 && <span className="tabular-nums opacity-70">{n}</span>}
            </span>
          ))}
        </p>
        <p className="mt-1 truncate text-[12.5px] text-muted-foreground" title={nomes.join(" · ")}>
          {nomes.join(" · ")}
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          Faturamento e pedidos <b>entram sozinhos</b> pela API — sem planilha.
          {algumSemDado && " Alguma ainda está trazendo o histórico."}
          {totalAvaliacoes > 0 && (
            <>
              {" "}
              <Star className="mb-0.5 inline size-3 text-amber-500" />{" "}
              <b>{totalAvaliacoes}</b> avaliaç{totalAvaliacoes === 1 ? "ão" : "ões"}{" "}
              já importada{totalAvaliacoes === 1 ? "" : "s"}.
            </>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={fechar}
        aria-label="Fechar aviso"
        className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-emerald-600/10 hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
