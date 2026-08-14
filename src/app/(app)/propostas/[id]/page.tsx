import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeft } from "lucide-react"

import { isSuperadmin } from "@/lib/auth/permissions"
import { getProposta } from "@/lib/data/propostas"

import { EditorProposta } from "../_components/editor-proposta"

export const metadata = { title: "Proposta — Delivery OS" }

export default async function PropostaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  if (!(await isSuperadmin())) notFound()
  const { id } = await params
  const proposta = await getProposta(id)
  if (!proposta) notFound()

  return (
    <div className="flex flex-1 flex-col gap-3 bg-muted/30 p-5">
      <div data-print="hide" className="flex items-center gap-3">
        <Link
          href="/propostas"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          Propostas
        </Link>
        <span className="font-mono text-sm font-semibold tabular-nums">
          {proposta.numero}
        </span>
        <span className="text-sm text-muted-foreground">
          {proposta.holdingNome}
        </span>
      </div>

      <EditorProposta proposta={proposta} />
    </div>
  )
}
