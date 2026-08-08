"use server"

import { revalidatePath } from "next/cache"

import { getAuthUser } from "@/lib/auth/permissions"
import { getCaixaHoldingId } from "@/lib/data/caixa"
import {
  definirFator,
  importarNF,
  unidadePeloCnpj,
  type ImportarResultado,
} from "@/lib/data/nf"
import { NFInvalidaError, parseNFe } from "@/lib/nf/parse-xml"

/** 5 MB. NF-e de 22 itens tem ~30 KB; 5 MB cobre nota gigante com folga e
 *  barra arquivo que não é nota antes de gastar CPU lendo. */
const LIMITE_BYTES = 5 * 1024 * 1024

export type PreviaNF = {
  ok: true
  chave: string
  numero: string | null
  emissao: string | null
  emitNome: string | null
  destCnpj: string | null
  destNome: string | null
  valorTotal: number
  itens: number
  /** Loja reconhecida pelo CNPJ. Null = a tela precisa perguntar. */
  unitId: string | null
  unitNome: string | null
  avisos: string[]
}

export type Falha = { ok: false; erro: string }

/**
 * Lê o XML e devolve o que encontrou, SEM gravar.
 *
 * Duas etapas de propósito: quando o CNPJ do destinatário não está em nenhuma
 * loja (o caso de 14 das 16 hoje), a tela precisa perguntar de quem é a nota
 * antes de qualquer escrita. Importar e corrigir depois deixaria custo errado
 * circulando no meio-tempo.
 */
export async function lerXml(formData: FormData): Promise<PreviaNF | Falha> {
  const holdingId = await getCaixaHoldingId()
  if (!holdingId) return { ok: false, erro: "Sem empresa no contexto." }

  const file = formData.get("arquivo")
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, erro: "Escolha o arquivo XML da nota." }
  if (file.size > LIMITE_BYTES)
    return { ok: false, erro: "Arquivo acima de 5 MB — não parece uma NF-e." }

  let xml: string
  try {
    xml = await file.text()
  } catch {
    return { ok: false, erro: "Não consegui ler o arquivo." }
  }

  try {
    const nf = parseNFe(xml)
    const loja = await unidadePeloCnpj(holdingId, nf.destCnpj)
    return {
      ok: true,
      chave: nf.chave,
      numero: nf.numero,
      emissao: nf.emissao,
      emitNome: nf.emitNome,
      destCnpj: nf.destCnpj,
      destNome: nf.destNome,
      valorTotal: nf.valorTotal,
      itens: nf.itens.length,
      unitId: loja?.id ?? null,
      unitNome: loja?.name ?? null,
      avisos: nf.avisos,
    }
  } catch (e) {
    if (e instanceof NFInvalidaError) return { ok: false, erro: e.message }
    return { ok: false, erro: "Não consegui ler este XML como NF-e." }
  }
}

export async function confirmarImportacao(
  formData: FormData,
): Promise<(ImportarResultado & { ok: true }) | Falha> {
  const holdingId = await getCaixaHoldingId()
  if (!holdingId) return { ok: false, erro: "Sem empresa no contexto." }

  const file = formData.get("arquivo")
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, erro: "Arquivo perdido. Escolha o XML de novo." }
  if (file.size > LIMITE_BYTES)
    return { ok: false, erro: "Arquivo acima de 5 MB — não parece uma NF-e." }

  const unitId = String(formData.get("unitId") ?? "") || null
  if (!unitId)
    return { ok: false, erro: "Escolha de qual loja é esta nota." }

  const user = await getAuthUser()
  const xml = await file.text()

  try {
    const nf = parseNFe(xml)
    const r = await importarNF(holdingId, nf, unitId, user?.id ?? null, xml)
    revalidatePath("/financeiro/notas")
    return { ok: true, ...r }
  } catch (e) {
    if (e instanceof NFInvalidaError) return { ok: false, erro: e.message }
    return {
      ok: false,
      erro: e instanceof Error ? e.message : "Falha ao importar a nota.",
    }
  }
}

export async function salvarFator(
  insumoId: string,
  unidadeUso: string | null,
  fator: number | null,
): Promise<{ ok: boolean; erro?: string }> {
  const holdingId = await getCaixaHoldingId()
  if (!holdingId) return { ok: false, erro: "Sem empresa no contexto." }
  if (fator !== null && (!Number.isFinite(fator) || fator <= 0))
    return { ok: false, erro: "O fator precisa ser um número maior que zero." }
  try {
    await definirFator(holdingId, insumoId, unidadeUso, fator)
    revalidatePath("/financeiro/notas")
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      erro: e instanceof Error ? e.message : "Falha ao salvar.",
    }
  }
}
