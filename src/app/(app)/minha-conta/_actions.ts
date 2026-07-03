"use server"

import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import { requireModulePermission } from "@/lib/auth/guards"
import { asaasUpdateCustomer } from "@/lib/asaas/client"

export type ContaState = { ok: boolean; message?: string }

const onlyDigits = (s: string) => s.replace(/\D/g, "")

/**
 * Salva os dados cadastrais / de NF da conta no NOSSO banco (holdings) e, se
 * houver cliente no Asaas, sincroniza lá também (fonte única no nosso lado).
 */
export async function saveContaInfo(
  _prev: ContaState,
  formData: FormData,
): Promise<ContaState> {
  await requireModulePermission("usuarios", "edit")
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, message: "Conta não encontrada." }

  const razao = String(formData.get("razaoSocial") ?? "").trim()
  const cpfCnpj = onlyDigits(String(formData.get("cpfCnpj") ?? ""))
  const cep = onlyDigits(String(formData.get("cep") ?? ""))
  const numero = String(formData.get("numero") ?? "").trim()

  if (razao.length < 2)
    return { ok: false, message: "Informe o nome ou a razão social." }
  if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14)
    return { ok: false, message: "CPF (11) ou CNPJ (14 dígitos) inválido." }
  if (cep && cep.length !== 8)
    return { ok: false, message: "CEP inválido (8 dígitos)." }

  const accountType = cpfCnpj.length === 14 ? "PJ" : "PF"
  const logradouro = String(formData.get("logradouro") ?? "").trim()
  const complemento = String(formData.get("complemento") ?? "").trim()
  const bairro = String(formData.get("bairro") ?? "").trim()
  const cidade = String(formData.get("cidade") ?? "").trim()
  const uf = String(formData.get("uf") ?? "").trim().toUpperCase().slice(0, 2)
  const telefone = onlyDigits(String(formData.get("telefone") ?? ""))
  const email = String(formData.get("email") ?? "").trim()

  const admin = createAdminClient()
  const { error } = await admin
    .from("holdings")
    .update({
      account_type: accountType,
      razao_social: razao,
      doc_cpf_cnpj: cpfCnpj,
      nf_cep: cep || null,
      nf_logradouro: logradouro || null,
      nf_numero: numero || null,
      nf_complemento: complemento || null,
      nf_bairro: bairro || null,
      nf_cidade: cidade || null,
      nf_uf: uf || null,
      nf_telefone: telefone || null,
      nf_email: email || null,
    })
    .eq("id", holdingId)
  if (error) return { ok: false, message: error.message }

  // Sincroniza com o Asaas se já houver cliente (mantém a NF correta lá).
  const { data: h } = await admin
    .from("holdings")
    .select("asaas_customer_id")
    .eq("id", holdingId)
    .maybeSingle()
  if (h?.asaas_customer_id) {
    try {
      await asaasUpdateCustomer(h.asaas_customer_id as string, {
        name: razao,
        cpfCnpj,
        postalCode: cep || undefined,
        address: logradouro || undefined,
        addressNumber: numero || undefined,
        complement: complemento || undefined,
        province: bairro || undefined,
        mobilePhone: telefone || undefined,
      })
    } catch (err) {
      // Salvou no nosso banco, mas o Asaas recusou — avisa sem perder o dado.
      return {
        ok: false,
        message:
          "Salvo aqui, mas o Asaas recusou a atualização: " +
          (err instanceof Error ? err.message : "erro"),
      }
    }
  }

  revalidatePath("/minha-conta/informacoes")
  return { ok: true }
}
