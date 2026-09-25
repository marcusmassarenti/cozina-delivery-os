"use client"

import { useEffect, useState } from "react"
import { Bot } from "lucide-react"

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

/**
 * Botão "Resposta automática" no topo de Avaliações, ao lado do período
 * (Marcus, 25/09/26: "pra deixar a tela mais limpa"). O cartão de controle e
 * a lista de respondidas moram na janela — a tela fica só com os números.
 *
 * Abre sozinha quando se chega pelo aviso "N respondidas por você"
 * (…#respondidas, ou o evento `respondidas:abrir` quando já se está aqui:
 * o Link do Next troca o hash sem disparar "hashchange").
 */
export function RespostaAutoJanela({
  ligadas,
  children,
}: {
  /** Lojas com a automática ligada — acende o ponto verde no botão. */
  ligadas: number
  children: React.ReactNode
}) {
  const [aberta, setAberta] = useState(false)

  useEffect(() => {
    const ver = () => {
      if (window.location.hash === "#respondidas") setAberta(true)
    }
    const abrir = () => setAberta(true)
    const t = setTimeout(ver, 0)
    window.addEventListener("hashchange", ver)
    window.addEventListener("respondidas:abrir", abrir)
    return () => {
      clearTimeout(t)
      window.removeEventListener("hashchange", ver)
      window.removeEventListener("respondidas:abrir", abrir)
    }
  }, [])

  return (
    <Dialog open={aberta} onOpenChange={setAberta}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-xs font-medium transition-colors hover:bg-muted"
          />
        }
      >
        <Bot className="size-3.5 text-emerald-600" />
        Resposta automática
        {ligadas > 0 && (
          <span
            className="ml-0.5 rounded-full bg-emerald-100 px-1.5 text-[10px] font-semibold tabular-nums text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
            title={`${ligadas} loja${ligadas === 1 ? "" : "s"} ligada${ligadas === 1 ? "" : "s"}`}
          >
            {ligadas}
          </span>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] gap-3 overflow-y-auto p-4 sm:max-w-5xl">
        <DialogTitle className="sr-only">Resposta automática</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  )
}
