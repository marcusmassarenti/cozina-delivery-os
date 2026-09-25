"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Bot, X } from "lucide-react"

import { respondidasAutoDesde } from "@/app/(app)/avaliacoes/_actions-auto"

/**
 * "A resposta automática respondeu N avaliações desde a sua última visita."
 *
 * POR QUE (Marcus, 25/09/26): "como ele sabe que está respondendo
 * automaticamente?" — não sabia. A máquina publicava em nome da loja e o
 * dono só descobria abrindo o iFood. O aviso fecha esse ciclo e leva pra
 * lista, onde ele dá 👍/👎 e a IA aprende o tom dele.
 *
 * Discreto de propósito (canto da tela, não modal): é notícia, não pendência.
 * O que pede ação — nota baixa — continua no popup das avaliações ruins.
 *  • "visto" guarda a data da ÚLTIMA resposta mostrada (localStorage): só
 *    reaparece quando a automática responder de novo;
 *  • confere no máximo a cada 30 min por aba (sessionStorage).
 */

const CHAVE_VISTO = "resp-auto-visto"
const CHAVE_CHECADO = "resp-auto-checado"
const INTERVALO_MS = 30 * 60 * 1000
/** Primeira visita: o que saiu nos últimos 2 dias (não o histórico todo). */
const JANELA_INICIAL_MS = 2 * 24 * 60 * 60 * 1000

export function RespondidasAutoAviso() {
  const [r, setR] = useState<{ total: number; lojas: number; ultima: string } | null>(null)

  useEffect(() => {
    let desde = new Date(Date.now() - JANELA_INICIAL_MS).toISOString()
    try {
      const ultimo = Number(sessionStorage.getItem(CHAVE_CHECADO) ?? 0)
      if (Date.now() - ultimo < INTERVALO_MS) return
      sessionStorage.setItem(CHAVE_CHECADO, String(Date.now()))
      desde = localStorage.getItem(CHAVE_VISTO) ?? desde
    } catch {
      // Sem storage (aba privada): confere mesmo assim, com a janela inicial.
    }
    void respondidasAutoDesde(desde)
      .then((x) => {
        if (x.total > 0 && x.ultima) setR({ total: x.total, lojas: x.lojas, ultima: x.ultima })
      })
      .catch(() => {})
  }, [])

  if (!r) return null

  function visto() {
    try {
      if (r) localStorage.setItem(CHAVE_VISTO, r.ultima)
    } catch {}
    setR(null)
  }

  return (
    <div
      role="status"
      className="fixed bottom-24 right-5 z-40 w-[340px] max-w-[calc(100vw-2.5rem)] rounded-xl border bg-card p-3.5 shadow-lg"
      data-print="hide"
    >
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
          <Bot className="size-4" />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">
            {r.total} avaliaç{r.total === 1 ? "ão respondida" : "ões respondidas"} por você
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A resposta automática publicou no iFood
            {r.lojas > 1 ? ` em ${r.lojas} lojas` : ""} desde a sua última visita.
            Veja o que saiu e diga se ficou bom — a IA aprende o seu jeito.
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <Link
              href="/avaliacoes#respondidas"
              onClick={() => {
                visto()
                // Já na tela de Avaliações: a lista abre por este evento
                // (vindo de outra tela, ela abre sozinha pelo hash).
                setTimeout(() => window.dispatchEvent(new Event("respondidas:abrir")), 150)
              }}
              className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              Ver e avaliar
            </Link>
            <button
              type="button"
              onClick={visto}
              className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted"
            >
              Ok
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={visto}
          aria-label="Fechar"
          className="rounded p-0.5 text-muted-foreground hover:bg-muted"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
