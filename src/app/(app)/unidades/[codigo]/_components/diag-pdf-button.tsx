"use client"

import { FileDown } from "lucide-react"

/**
 * Botão "PDF" da aba Diagnóstico. Clona o container #diag-report num overlay
 * filho direto do <body> e esconde o resto com display:none (regras em
 * globals.css, classe .printing-diag) — assim o PDF sai só com o diagnóstico.
 *
 * O clone entra dentro de uma <table> com <thead>/<tfoot>: no print, esses
 * grupos REPETEM em toda página, então funcionam como espaçadores de topo/base
 * por página. É a forma confiável de margem vertical no "Salvar como PDF" do
 * Chrome, que ignora a margem vertical do @page no fluxo interativo.
 */
export function DiagPdfButton() {
  function exportarPdf() {
    const el = document.getElementById("diag-report")
    if (!el) return
    const clone = el.cloneNode(true) as HTMLElement
    clone.querySelectorAll(".diag-print-hide").forEach((n) => n.remove())
    // No PDF a operação sai completa: força abrir tudo que é colapsável na tela.
    clone.querySelectorAll("details").forEach((d) => d.setAttribute("open", ""))
    const overlay = document.createElement("div")
    overlay.id = "diag-print-overlay"
    // Tabela: thead = espaço no topo de cada página; tfoot = espaço na base.
    const table = document.createElement("table")
    table.className = "diag-ptable"
    const thead = document.createElement("thead")
    thead.innerHTML = '<tr><td><div class="diag-ptop"></div></td></tr>'
    const tfoot = document.createElement("tfoot")
    tfoot.innerHTML = '<tr><td><div class="diag-pbot"></div></td></tr>'
    const tbody = document.createElement("tbody")
    const cell = document.createElement("td")
    cell.className = "diag-pcell"
    cell.appendChild(clone)
    const row = document.createElement("tr")
    row.appendChild(cell)
    tbody.appendChild(row)
    table.append(thead, tfoot, tbody)
    overlay.appendChild(table)
    document.body.appendChild(overlay)
    document.body.classList.add("printing-diag")
    const cleanup = () => {
      overlay.remove()
      document.body.classList.remove("printing-diag")
      window.removeEventListener("afterprint", cleanup)
    }
    window.addEventListener("afterprint", cleanup)
    // Espera pintar o overlay antes de imprimir (senão o Chrome captura a
    // folha antes do conteúdo e o PDF sai em branco).
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
  }

  return (
    <button
      type="button"
      onClick={exportarPdf}
      title="Exportar em PDF"
      className="diag-print-hide flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <FileDown className="size-3.5" />
      PDF
    </button>
  )
}
