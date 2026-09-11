"use client"

import { Printer } from "lucide-react"

import { forcarTemaClaroNoPrint } from "@/lib/print-tema-claro"

/**
 * "Salvar em PDF" é o diálogo de impressão do navegador — é o que dá um PDF
 * idêntico ao que está na tela, sem gerar arquivo no servidor. O tema escuro
 * sai só durante a impressão (ver `forcarTemaClaroNoPrint`).
 */
export function BotaoImprimir() {
  function imprimir() {
    const restaurar = forcarTemaClaroNoPrint()
    window.addEventListener("afterprint", restaurar, { once: true })
    window.print()
  }
  return (
    <button
      type="button"
      onClick={imprimir}
      className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Printer className="size-3.5" />
      Salvar em PDF
    </button>
  )
}
