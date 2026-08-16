"use server"

/**
 * Salvar o modelo da proposta.
 *
 * Linha única na tabela (`id` boolean fixo), então é sempre upsert — não
 * existe "criar" nem "apagar" modelo, existe "como está escrito hoje".
 */
import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { isSuperadmin } from "@/lib/auth/permissions"
import { getAuthUser } from "@/lib/auth/permissions"
import type { ItemEscopo } from "@/lib/data/proposta-modelo"

export type EstadoModelo = { ok: boolean; message?: string }

export async function salvarModeloProposta(
  input: {
    escopoItens: ItemEscopo[]
    atendimento: string
    termoAceite: string
    contratoUrl: string
    faturamento: string
    contratarMais: string
    treinamentoPrazo: string
    rodapeValores: string
  },
): Promise<EstadoModelo> {
  // Documento comercial da empresa: só o dono mexe.
  if (!(await isSuperadmin())) {
    return { ok: false, message: "Sem permissão." }
  }
  const user = await getAuthUser()

  // ⚠️ Campo em branco é gravado como NULL, não como "". É o que faz o padrão
  // do código voltar a valer (ver proposta-modelo.ts): limpar um campo na tela
  // significa "usa o texto de fábrica", não "deixa vazio no PDF".
  const nulo = (s: string) => (s.trim() === "" ? null : s.trim())

  const { error } = await createAdminClient()
    .from("propostas_modelo")
    .upsert(
      {
        id: true,
        escopo_itens: input.escopoItens.filter((i) => i.recurso.trim() !== ""),
        atendimento: nulo(input.atendimento),
        termo_aceite: nulo(input.termoAceite),
        contrato_url: nulo(input.contratoUrl),
        faturamento: nulo(input.faturamento),
        contratar_mais: nulo(input.contratarMais),
        treinamento_prazo: nulo(input.treinamentoPrazo),
        rodape_valores: nulo(input.rodapeValores),
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      },
      { onConflict: "id" },
    )

  if (error) return { ok: false, message: error.message }

  // As propostas já emitidas leem o modelo na hora de renderizar, então mudar
  // aqui muda o PDF de todas — inclusive das enviadas. É o comportamento certo
  // pra texto padrão (corrigir uma frase errada vale pra todo mundo), mas o
  // aviso na tela existe pra isso não pegar ninguém de surpresa.
  revalidatePath("/propostas")
  return { ok: true }
}
