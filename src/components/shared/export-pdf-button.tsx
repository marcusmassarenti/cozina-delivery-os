"use client"

import * as React from "react"
import { AlertTriangle, FileDown } from "lucide-react"
import Link from "next/link"

import { forcarTemaClaroNoPrint } from "@/lib/print-tema-claro"

export type AvisoExportacao = {
  /** Plataformas com importação em atraso, já em português. */
  faltando: string[]
  /** A linha de procedência completa, pra pessoa ver o que VAI sair. */
  linha: string
}

/**
 * Exporta a página como PDF via impressão nativa do navegador. Antes de
 * imprimir, abre todos os <details> recolhidos pra entrarem no PDF. O usuário
 * escolhe "Salvar como PDF" no diálogo. O layout de impressão é controlado pelo
 * CSS `@media print` em globals.css (esconde sidebar/topbar via data-print).
 *
 * ── A CONFIRMAÇÃO (Marcus, 22/08/26) ─────────────────────────────────────
 * Um gestor exportou o fechamento do mês e mandou pro cliente dele sem saber
 * que a importação da Keeta estava parada; o cliente questionou o número e ele
 * não tinha resposta. O dado existia no sistema — faltou ele cruzar com a
 * pessoa no momento em que o número deixa de ser consulta e vira afirmação.
 *
 * NÃO bloqueia: o gestor pode ter motivo pra exportar assim (fechamento
 * parcial, conferência interna). Bloquear seria trocar um problema por outro,
 * e ele acabaria contornando por fora. O que o diálogo garante é que ninguém
 * exporta sem TER VISTO.
 */
export function ExportPdfButton({
  label = "Exportar PDF",
  aviso,
}: {
  label?: string
  /** Quando presente e com pendência, pede confirmação antes de imprimir. */
  aviso?: AvisoExportacao
}) {
  const [confirmando, setConfirmando] = React.useState(false)

  function imprimir() {
    document
      .querySelectorAll("details")
      .forEach((d) => d.setAttribute("open", ""))

    const restaurarTema = forcarTemaClaroNoPrint()
    let limpo = false
    const limpar = () => {
      if (limpo) return
      limpo = true
      restaurarTema()
      window.removeEventListener("afterprint", limpar)
    }
    window.addEventListener("afterprint", limpar)

    requestAnimationFrame(() => {
      window.print()
      // Safari não dispara afterprint de forma confiável.
      setTimeout(limpar, 1500)
    })
  }

  function handleExport() {
    if (aviso && aviso.faltando.length > 0) {
      setConfirmando(true)
      return
    }
    imprimir()
  }

  return (
    <>
      <button
        type="button"
        onClick={handleExport}
        data-print="hide"
        className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-xs font-medium transition-colors hover:bg-muted"
      >
        <FileDown className="size-3.5" />
        {label}
      </button>

      {confirmando && aviso && (
        <div
          data-print="hide"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setConfirmando(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border bg-card p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="size-4 text-amber-500" />
              {aviso.faltando.length === 1
                ? `${aviso.faltando[0]} está com importação em atraso`
                : `${aviso.faltando.join(" e ")} estão com importação em atraso`}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Os totais deste relatório <b>não incluem</b> esse período. Se ele
              for pra um cliente, o número vai chegar incompleto.
            </p>
            <p className="mt-2 rounded-md bg-muted/50 px-2.5 py-2 text-[11px] text-muted-foreground">
              {aviso.linha}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              O PDF sai com essa mesma ressalva no topo — quem receber vê o
              mesmo que você está vendo agora.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <Link
                href="/importacao"
                className="rounded-md border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
              >
                Ver o que falta
              </Link>
              <button
                type="button"
                onClick={() => {
                  setConfirmando(false)
                  // Espera o diálogo sair da tela antes de chamar o print.
                  setTimeout(imprimir, 60)
                }}
                className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Exportar assim mesmo
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
