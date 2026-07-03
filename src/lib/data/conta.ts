import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import { asaasGetCustomer } from "@/lib/asaas/client"

export type ContaInfo = {
  holdingId: string
  /** Nome da conta (holdings.name) — usado no app. */
  name: string
  accountType: "PF" | "PJ" | null
  razaoSocial: string
  cpfCnpj: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  telefone: string
  email: string
  hasAsaasCustomer: boolean
  /** true quando os dados vieram do Asaas (cadastro nosso ainda vazio). */
  fromAsaas: boolean
}

/**
 * Dados cadastrais / de NF da conta. Fonte: nosso banco (holdings). Se o
 * cadastro ainda está vazio mas já existe cliente no Asaas, puxa de lá pra
 * pré-preencher (backfill) — assim quem já assinou vê os dados na hora.
 */
export async function getContaInfo(): Promise<ContaInfo | null> {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return null
  const admin = createAdminClient()
  const { data: h } = await admin
    .from("holdings")
    .select(
      "name, razao_social, doc_cpf_cnpj, account_type, nf_cep, nf_logradouro, nf_numero, nf_complemento, nf_bairro, nf_cidade, nf_uf, nf_telefone, nf_email, asaas_customer_id",
    )
    .eq("id", holdingId)
    .maybeSingle()
  if (!h) return null

  const hasAsaasCustomer = !!h.asaas_customer_id
  const cadastroVazio = !h.doc_cpf_cnpj && !h.nf_cep

  let info: Omit<ContaInfo, "holdingId" | "name" | "hasAsaasCustomer" | "fromAsaas"> = {
    accountType: (h.account_type as "PF" | "PJ" | null) ?? null,
    razaoSocial: (h.razao_social as string) ?? "",
    cpfCnpj: (h.doc_cpf_cnpj as string) ?? "",
    cep: (h.nf_cep as string) ?? "",
    logradouro: (h.nf_logradouro as string) ?? "",
    numero: (h.nf_numero as string) ?? "",
    complemento: (h.nf_complemento as string) ?? "",
    bairro: (h.nf_bairro as string) ?? "",
    cidade: (h.nf_cidade as string) ?? "",
    uf: (h.nf_uf as string) ?? "",
    telefone: (h.nf_telefone as string) ?? "",
    email: (h.nf_email as string) ?? "",
  }
  let fromAsaas = false

  if (cadastroVazio && hasAsaasCustomer) {
    const c = await asaasGetCustomer(h.asaas_customer_id as string)
    if (c) {
      fromAsaas = true
      const doc = (c.cpfCnpj ?? "").replace(/\D/g, "")
      info = {
        accountType: doc.length === 14 ? "PJ" : doc.length === 11 ? "PF" : null,
        razaoSocial: c.name ?? "",
        cpfCnpj: doc,
        cep: (c.postalCode ?? "").replace(/\D/g, ""),
        logradouro: c.address ?? "",
        numero: c.addressNumber ?? "",
        complemento: c.complement ?? "",
        bairro: c.province ?? "",
        cidade: c.cityName ?? "",
        uf: c.state ?? "",
        telefone: c.mobilePhone ?? "",
        email: "",
      }
    }
  }

  return {
    holdingId,
    name: (h.name as string) ?? "",
    hasAsaasCustomer,
    fromAsaas,
    ...info,
  }
}
