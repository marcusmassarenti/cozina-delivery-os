"use client"

import { FileDown } from "lucide-react"

/**
 * Exporta o relatório como PDF via impressão nativa do navegador.
 * Antes de imprimir, abre todos os <details> recolhidos pra a tabela
 * detalhada entrar no PDF. O usuário escolhe "Salvar como PDF" no diálogo.
 */
export function ExportPdfButton() {
  function handleExport() {
    document
      .querySelectorAll("details")
      .forEach((d) => d.setAttribute("open", ""))
    // espera o layout reflowar antes de abrir o diálogo de impressão
    requestAnimationFrame(() => window.print())
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-xs font-medium transition-colors hover:bg-muted"
    >
      <FileDown className="size-3.5" />
      Exportar PDF
    </button>
  )
}
