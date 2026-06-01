"use client"

import { FileDown } from "lucide-react"

/**
 * Exporta a página como PDF via impressão nativa do navegador. Antes de
 * imprimir, abre todos os <details> recolhidos pra entrarem no PDF. O usuário
 * escolhe "Salvar como PDF" no diálogo. O layout de impressão é controlado pelo
 * CSS `@media print` em globals.css (esconde sidebar/topbar via data-print).
 */
export function ExportPdfButton({ label = "Exportar PDF" }: { label?: string }) {
  function handleExport() {
    document
      .querySelectorAll("details")
      .forEach((d) => d.setAttribute("open", ""))
    requestAnimationFrame(() => window.print())
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      data-print="hide"
      className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-xs font-medium transition-colors hover:bg-muted"
    >
      <FileDown className="size-3.5" />
      {label}
    </button>
  )
}
