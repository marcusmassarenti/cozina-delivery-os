"use client"

import * as React from "react"
import { Check, Copy, Download, KeyRound } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Mostra os códigos de recuperação. Aparece UMA vez, logo depois de gerá-los —
 * depois disso só existem em hash no banco, e nem nós conseguimos lê-los.
 */
export function CodigosRecuperacao({
  codigos,
  email,
}: {
  codigos: string[]
  email: string
}) {
  const [copiado, setCopiado] = React.useState(false)

  const texto = [
    "Códigos de recuperação — Delivery OS",
    `Conta: ${email}`,
    "",
    "Cada código funciona UMA vez. Guarde em local seguro.",
    "Se você perder o celular, use um deles para entrar.",
    "",
    ...codigos,
  ].join("\n")

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sem permissão de área de transferência — o usuário ainda pode baixar.
    }
  }

  function baixar() {
    const blob = new Blob([texto], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "codigos-recuperacao-delivery-os.txt"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/25">
      <div className="flex items-start gap-2">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">
            Guarde seus códigos de recuperação
          </p>
          <p className="mt-0.5 text-xs text-amber-800/90 dark:text-amber-400/80">
            Esta é a <b>única vez</b> que eles aparecem. Se você perder o
            celular, é com um deles que vai conseguir entrar. Cada código
            funciona uma vez só.
          </p>
        </div>
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {codigos.map((c) => (
          <li
            key={c}
            className="rounded border bg-background px-2 py-1.5 text-center font-mono text-xs tracking-wide"
          >
            {c}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={copiar} className="h-8">
          {copiado ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {copiado ? "Copiado" : "Copiar"}
        </Button>
        <Button type="button" variant="outline" onClick={baixar} className="h-8">
          <Download className="size-3.5" />
          Baixar .txt
        </Button>
      </div>

      <p className="mt-3 text-[11px] text-amber-800/80 dark:text-amber-400/70">
        Guarde num gerenciador de senhas ou impresso em lugar seguro — não no
        mesmo celular do aplicativo autenticador, senão perder o aparelho leva
        os dois embora.
      </p>
    </div>
  )
}
