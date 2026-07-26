"use client"

import * as React from "react"
import { FileDown } from "lucide-react"

import { forcarTemaClaroNoPrint } from "@/lib/print-tema-claro"

/**
 * Exporta o Dashboard em PDF A4 retrato, uma seção por página.
 *
 * Por que não é o ExportPdfButton comum: o dashboard não é um relatório, é
 * uma tela de trabalho. Impresso como está, sairia com filtros e avisos no
 * meio, com os grids nascendo na largura da TELA (cortados na direita da
 * folha) e — o pior — só com a plataforma que estava selecionada em cada
 * card de abas. A classe no <body> liga um modo de impressão próprio,
 * definido em globals.css, que trava tudo em 190mm.
 */
export function DashboardPdfButton() {
  const [preparando, setPreparando] = React.useState(false)

  function exportar() {
    setPreparando(true)
    const body = document.body
    body.classList.add("printing-dashboard")
    const restaurarTema = forcarTemaClaroNoPrint()
    document
      .querySelectorAll("details")
      .forEach((d) => d.setAttribute("open", ""))

    let limpo = false
    const limpar = () => {
      if (limpo) return
      limpo = true
      body.classList.remove("printing-dashboard")
      restaurarTema()
      setPreparando(false)
      window.removeEventListener("afterprint", limpar)
    }
    window.addEventListener("afterprint", limpar)

    // Dois frames: o primeiro aplica a classe, o segundo garante que o
    // layout já reflowou com as abas abertas antes de o diálogo congelar a
    // página. Com um só, cards de aba saíam cortados.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.print()
        // Safari não dispara afterprint de forma confiável.
        setTimeout(limpar, 1500)
      }),
    )
  }

  return (
    <button
      type="button"
      onClick={exportar}
      disabled={preparando}
      data-print="hide"
      className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-60"
    >
      <FileDown className="size-3.5" />
      {preparando ? "Preparando..." : "Exportar PDF"}
    </button>
  )
}
