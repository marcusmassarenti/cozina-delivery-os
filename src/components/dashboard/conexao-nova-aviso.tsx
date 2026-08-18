"use client"

import * as React from "react"
import { PartyPopper, Star, X } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import type {
  ConexaoNova,
  PrimeiraAvaliacao,
} from "@/lib/data/conexoes-novas"

const ROTULO = {
  "99food": "99 Food",
  cardapioweb: "Cardápio Web",
} as const

/**
 * "Sua loja foi conectada!" para 99 Food e Cardápio Web.
 *
 * ── POR QUE (Marcus, 18/08/26): "o cliente fica perdido" ─────────────────
 * O iFood comemorava a conexão e as outras duas não diziam nada. Quem conecta
 * o Cardápio Web vê a tela igual à de antes e não sabe se funcionou — e o
 * silêncio no meio de um onboarding é o que faz a pessoa desistir ou abrir
 * chamado.
 *
 * A mensagem muda conforme o dado JÁ ter chegado: "conectada" quando ainda
 * está trazendo, "já trazendo dado" quando chegou. Dizer "pronto!" com a tela
 * ainda vazia seria prometer o que a pessoa não vê.
 */
export function ConexaoNovaAviso({ conexoes }: { conexoes: ConexaoNova[] }) {
  /**
   * Fechar é COMPLEMENTO do prazo de 7 dias, não substituto.
   *
   * O aviso do iFood já aprendeu isso: o "fechar" mora no localStorage, então
   * some ao trocar de navegador ou de celular — a DG FOODS chegou a ter 47
   * avisos voltando a cada aparelho novo. Por isso o sumiço definitivo continua
   * sendo o prazo (servidor, vale em todo lugar) e o X serve pra quem quer
   * limpar a tela agora.
   */
  const [fechados, setFechados] = React.useState<string[]>([])
  React.useEffect(() => {
    try {
      setFechados(
        JSON.parse(localStorage.getItem("conexao-nova-fechados") ?? "[]"),
      )
    } catch {
      // localStorage indisponível (aba anônima, storage cheio): mostrar o
      // aviso é o comportamento seguro.
    }
  }, [])

  function fechar(chave: string) {
    const novo = [...fechados, chave]
    setFechados(novo)
    try {
      localStorage.setItem("conexao-nova-fechados", JSON.stringify(novo))
    } catch {}
  }

  const visiveis = conexoes.filter(
    (c) => !fechados.includes(`${c.plataforma}|${c.unitId}`),
  )
  if (visiveis.length === 0) return null

  return (
    <div className="space-y-2">
      {visiveis.map((c) => (
        <div
          key={`${c.plataforma}|${c.unitId}`}
          className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/40"
        >
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600/10">
            <PartyPopper className="size-4 text-emerald-700 dark:text-emerald-400" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
              <span>
                Sua loja <b>{c.unitCode} · {c.unitName}</b> foi conectada ao
              </span>
              <PlatformLogo platform={c.plataforma} size="sm" />
              <span>{ROTULO[c.plataforma]}! 🎉</span>
            </p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
              {c.temDado ? (
                <>
                  Faturamento e pedidos <b>já estão entrando sozinhos</b> pela
                  API — sem planilha.
                </>
              ) : (
                <>
                  Estamos trazendo o histórico agora. Os números aparecem aqui
                  assim que a primeira carga terminar — não precisa fazer nada.
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => fechar(`${c.plataforma}|${c.unitId}`)}
            aria-label="Fechar aviso"
            className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-emerald-600/10 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

/**
 * Primeira carga de avaliações.
 *
 * ⚠️ SEPARADO DO AVISO DE CONEXÃO DE PROPÓSITO. A barra de cobertura fala de
 * faturamento; quando ela diz "iFood até 18/ago", o cliente lê "veio tudo" — e
 * avaliação é outra rotina, com outro horário (cron às 7h). Sem dizer isso, a
 * tela de avaliações vazia parece defeito, e é o tipo de silêncio que gera
 * chamado no primeiro dia (Marcus, 18/08/26).
 *
 * A mensagem muda conforme já ter chegado: enquanto está zerada explica QUANDO
 * chega; depois confirma o que entrou e que dali em diante é sozinho.
 */
export function PrimeiraAvaliacaoAviso({
  itens,
}: {
  itens: PrimeiraAvaliacao[]
}) {
  if (itens.length === 0) return null
  return (
    <div className="space-y-2">
      {itens.map((a) => (
        <div
          key={a.unitId}
          className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3"
        >
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
            <Star className="size-4 text-amber-600 dark:text-amber-400" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              Avaliações de <b>{a.unitCode} · {a.unitName}</b>
              {a.quantas > 0 ? " já estão aqui" : " a caminho"}
            </p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
              {a.quantas > 0 ? (
                <>
                  <b>{a.quantas}</b> avaliações importadas. A partir de agora
                  entram sozinhas, uma vez por dia.
                </>
              ) : (
                <>
                  A avaliação vem numa rotina separada do faturamento, que roda{" "}
                  <b>uma vez por dia, de manhã</b>. Se a tela de avaliações
                  ainda estiver vazia, é isso — não é problema na conexão.
                </>
              )}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
