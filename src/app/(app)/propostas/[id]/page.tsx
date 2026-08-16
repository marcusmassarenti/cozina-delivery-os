import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeft } from "lucide-react"

import { isSuperadmin } from "@/lib/auth/permissions"
import { createAdminClient } from "@/lib/supabase/admin"
import { getProposta } from "@/lib/data/propostas"

import { EditorProposta } from "../_components/editor-proposta"
import { getModeloProposta } from "@/lib/data/proposta-modelo"

export const metadata = { title: "Proposta — Delivery OS" }

export default async function PropostaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  if (!(await isSuperadmin())) notFound()
  const { id } = await params
  const [proposta, modelo] = await Promise.all([
    getProposta(id),
    getModeloProposta(),
  ])
  if (!proposta) notFound()

  /**
   * Espelha o cadastro do Asaas ao ABRIR a proposta, não só ao criar.
   *
   * ⚠️ Eu tinha posto o espelho só no `montarDoCadastro` (criação) e disse ao
   * Marcus que bastava abrir a proposta da DG pra ver o CNPJ. Não bastava:
   * abrir lê o retrato salvo e não toca no cadastro. O gatilho estava no lugar
   * errado — quem já tinha proposta criada ficava sem jeito de puxar o dado.
   *
   * Aqui ele preenche `holdings` (não mexe no retrato da proposta, que é
   * congelado de propósito). Com o cadastro cheio, o botão "Puxar do cadastro
   * de novo" passa a ter o que trazer.
   */
  try {
    const { espelharCadastroDoAsaas } = await import("@/lib/data/espelhar-asaas")
    await espelharCadastroDoAsaas(proposta.holdingId)
  } catch (e) {
    console.error("espelharCadastroDoAsaas (abrir proposta):", e)
  }

  // O cadastro tem algo que o retrato da proposta não tem? Então o botão
  // "Puxar do cadastro de novo" tem o que trazer — e a tela diz isso, em vez
  // de deixar a pessoa clicar no escuro pra descobrir.
  const { data: hAtual } = await createAdminClient()
    .from("holdings")
    .select("doc_cpf_cnpj, nf_logradouro")
    .eq("id", proposta.holdingId)
    .maybeSingle()
  const cadastroTemMais =
    (!!(hAtual as { doc_cpf_cnpj?: string } | null)?.doc_cpf_cnpj &&
      !proposta.dados.cnpj) ||
    (!!(hAtual as { nf_logradouro?: string } | null)?.nf_logradouro &&
      !proposta.dados.endereco)

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

      <EditorProposta
        proposta={proposta}
        modelo={modelo}
        cadastroTemMais={cadastroTemMais}
      />
    </div>
  )
}
