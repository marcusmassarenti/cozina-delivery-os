"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Star, X } from "lucide-react"

import {
  avaliacoesRuinsParaPopup,
  type AvaliacaoRuim,
} from "@/app/(app)/avaliacoes/_actions-auto"
import { ResponderAvaliacao } from "@/app/(app)/avaliacoes/_components/responder-avaliacao"

/**
 * Popup das avaliações de nota 1 a 3 que ainda dá pra responder.
 *
 * A outra metade da resposta automática (Marcus, 25/09/26): nota 4 e 5 a
 * máquina responde; nota baixa pede uma pessoa — e a pessoa precisa SABER,
 * porque o iFood publica sem resposta depois de 5 dias. Na Koike, das duas
 * notas 1 do mês, nenhuma foi respondida.
 *
 * Cadência pra não virar paisagem:
 *  • confere no máximo a cada 30 min por aba (sessionStorage);
 *  • "Responder depois" some com ESSAS avaliações por 24 h (localStorage);
 *    avaliação nova reabre na hora.
 * Não é aviso permanente: sem nota baixa pendente, nunca aparece.
 */

const CHAVE_CHECADO = "av-ruins-checado"
const CHAVE_DISPENSADAS = "av-ruins-dispensadas"
const INTERVALO_MS = 30 * 60 * 1000
const SONECA_MS = 24 * 60 * 60 * 1000

function lerDispensadas(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_DISPENSADAS) ?? "{}")
  } catch {
    return {}
  }
}

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export function AvaliacoesRuinsPopup() {
  const [itens, setItens] = useState<AvaliacaoRuim[]>([])
  const [podeIa, setPodeIa] = useState(false)
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    // Sem "cancelado" no cleanup, de propósito: a trava de 30 min é gravada
    // antes da busca, então se a primeira montagem descartasse o resultado
    // (o React monta duas vezes em dev), a segunda veria a trava e não
    // buscaria — o popup nunca abria. Atualizar estado depois de desmontar
    // é inofensivo.
    try {
      const ultimo = Number(sessionStorage.getItem(CHAVE_CHECADO) ?? 0)
      if (Date.now() - ultimo < INTERVALO_MS) return
      sessionStorage.setItem(CHAVE_CHECADO, String(Date.now()))
    } catch {
      // Sem storage (aba privada): confere mesmo assim.
    }
    void avaliacoesRuinsParaPopup()
      .then((r) => {
        const disp = lerDispensadas()
        const agora = Date.now()
        const visiveis = r.itens.filter(
          (i) => !disp[i.avaliacaoId] || agora - disp[i.avaliacaoId] > SONECA_MS,
        )
        if (visiveis.length === 0) return
        setItens(visiveis)
        setPodeIa(r.podeIa)
        setAberto(true)
      })
      .catch(() => {})
  }, [])

  if (!aberto || itens.length === 0) return null

  function depois() {
    try {
      const disp = lerDispensadas()
      const agora = Date.now()
      for (const i of itens) disp[i.avaliacaoId] = agora
      // Faxina: nada com mais de 7 dias (a avaliação já saiu do prazo).
      for (const k of Object.keys(disp))
        if (agora - disp[k] > 7 * SONECA_MS) delete disp[k]
      localStorage.setItem(CHAVE_DISPENSADAS, JSON.stringify(disp))
    } catch {
      // sem storage: só fecha
    }
    setAberto(false)
  }

  const ultimoDia = itens.filter((i) => i.diasRestantes <= 0).length

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="av-ruins-titulo"
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border bg-background shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400">
              <Star className="size-5" />
            </span>
            <div>
              <h2 id="av-ruins-titulo" className="text-lg font-semibold leading-tight">
                {itens.length}{" "}
                {itens.length === 1 ? "avaliação ruim esperando" : "avaliações ruins esperando"}{" "}
                resposta
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                O iFood publica sem a sua resposta depois de 5 dias.
                {ultimoDia > 0 &&
                  ` ${ultimoDia} ${ultimoDia === 1 ? "vence" : "vencem"} hoje.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={depois}
            aria-label="Fechar"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="divide-y">
          {itens.map((i) => (
            <div key={i.avaliacaoId} className="px-5 py-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="text-amber-500" title={`${i.nota} de 5`}>
                  {"★".repeat(i.nota)}
                  <span className="text-muted-foreground/30">{"★".repeat(5 - i.nota)}</span>
                </span>
                <span className="font-medium">{i.loja}</span>
                <span className="rounded bg-muted px-1 text-[10px] font-bold tabular-nums text-muted-foreground">
                  #{i.code}
                </span>
                <span className="text-muted-foreground">{dm(i.dataAvaliacao)}</span>
                <span
                  className={`ml-auto font-medium ${
                    i.diasRestantes <= 0
                      ? "text-rose-600 dark:text-rose-400"
                      : i.diasRestantes === 1
                        ? "text-amber-600"
                        : "text-muted-foreground"
                  }`}
                >
                  {i.diasRestantes <= 0
                    ? "último dia"
                    : `faltam ${i.diasRestantes} dia${i.diasRestantes === 1 ? "" : "s"}`}
                </span>
              </div>
              {i.comentario && (
                <p className="mt-1 text-sm italic text-foreground/90">
                  &ldquo;{i.comentario}&rdquo;
                </p>
              )}
              {i.tagsNegativas.length > 0 && (
                <p className="mt-1 text-[11px] text-rose-700 dark:text-rose-400">
                  {i.tagsNegativas.join(" · ")}
                </p>
              )}
              <ResponderAvaliacao
                avaliacaoId={i.avaliacaoId}
                podeIa={podeIa}
                diasRestantes={i.diasRestantes}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 border-t p-4">
          <Link
            href="/avaliacoes"
            onClick={() => setAberto(false)}
            className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Ver todas em Avaliações
          </Link>
          <button
            type="button"
            onClick={depois}
            className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            Responder depois
          </button>
        </div>
      </div>
    </div>
  )
}
