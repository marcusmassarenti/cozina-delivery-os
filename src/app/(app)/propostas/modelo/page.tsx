import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeft } from "lucide-react"

import { isSuperadmin } from "@/lib/auth/permissions"
import {
  MODELO_PADRAO,
  getModeloProposta,
} from "@/lib/data/proposta-modelo"
import { EditorModelo } from "./_components/editor-modelo"

/**
 * Modelo da proposta comercial.
 *
 * Só superadmin: é documento comercial da Lab of Change, não configuração de
 * cliente. Mesmo portão de `/propostas`.
 */
export default async function ModeloPropostaPage() {
  if (!(await isSuperadmin())) notFound()
  const modelo = await getModeloProposta()

  return (
    <div className="flex flex-1 flex-col gap-5 bg-muted/30 p-6">
      <div>
        <Link
          href="/propostas"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Propostas
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Modelo da proposta
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Os textos padrão que entram em toda proposta nova. O que muda por
          cliente (preço, lojas, contatos) você edita na própria proposta.
        </p>
      </div>

      <EditorModelo inicial={modelo} padrao={MODELO_PADRAO} />
    </div>
  )
}
