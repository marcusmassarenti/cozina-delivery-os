"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { BarChart3, Table2 } from "lucide-react"

/** Custos (preencher) × Painel (ler). Preserva o período escolhido. */
export function Abas({ codigo, aba }: { codigo: string; aba: string }) {
  const params = useSearchParams()

  const href = (destino: "custos" | "painel") => {
    const q = new URLSearchParams(params.toString())
    if (destino === "painel") q.set("aba", "painel")
    else q.delete("aba")
    const s = q.toString()
    return `/ficha-tecnica/${encodeURIComponent(codigo)}${s ? `?${s}` : ""}`
  }

  const cls = (ativo: boolean) =>
    `inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
      ativo
        ? "bg-background text-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground"
    }`

  return (
    <div className="inline-flex rounded-lg bg-muted p-0.5">
      <Link href={href("custos")} className={cls(aba === "custos")}>
        <Table2 className="size-3.5" />
        Custos
      </Link>
      <Link href={href("painel")} className={cls(aba === "painel")}>
        <BarChart3 className="size-3.5" />
        Painel
      </Link>
    </div>
  )
}
