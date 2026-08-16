import "server-only"

/**
 * Traz o cadastro fiscal do cliente do Asaas para `holdings`.
 *
 * ── O PROBLEMA (Marcus, 16/08/26) ────────────────────────────────────────
 * "em propostas, dgfoods já não tem CNPJ?" — a proposta mostrava "—" no CNPJ,
 * no endereço e na razão social. Não era bug de leitura: o campo estava vazio
 * mesmo, e não só na DG. Dos 8 clientes ativos, ZERO tinham CNPJ, razão social
 * ou endereço preenchidos aqui.
 *
 * E a NF da DG saiu normalmente. O motivo: esses dados moram no ASAAS, no
 * cadastro do cliente, e nunca voltaram pra cá. O sistema emitia nota com um
 * CNPJ que ele próprio não sabia qual era.
 *
 * ── POR QUE ESPELHAR EM VEZ DE CONSULTAR NA HORA ─────────────────────────
 * Documento (proposta, contrato) não pode depender de uma API externa estar de
 * pé no instante em que alguém aperta imprimir. Espelhado, o dado está aqui e
 * a tela abre offline do Asaas.
 *
 * ⚠️ NUNCA SOBRESCREVE O QUE JÁ ESTÁ PREENCHIDO.
 *
 * O Asaas é a origem, mas não é a autoridade sobre o que alguém corrigiu à mão
 * aqui: se o endereço foi ajustado no nosso cadastro e o do Asaas está velho,
 * espelhar por cima desfaz a correção — e desfaz calado, que é pior. Preenche
 * só o que está VAZIO. Divergência entre os dois vai pro log, pra aparecer sem
 * estragar nada.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { asaasGetCustomer, asaasIsMock } from "@/lib/asaas/client"

export type ResultadoEspelho = {
  /** Campos que estavam vazios e foram preenchidos. */
  preenchidos: string[]
  /** Campos com valor diferente do Asaas — mantidos como estavam. */
  divergentes: string[]
  motivo?: string
}

const VAZIO: ResultadoEspelho = { preenchidos: [], divergentes: [] }

export async function espelharCadastroDoAsaas(
  holdingId: string,
): Promise<ResultadoEspelho> {
  // Sem chave (dev local), o cliente do Asaas devolve dado simulado. Espelhar
  // isso encheria a base de "Cliente (simulado)" e "00000000000".
  if (asaasIsMock()) return { ...VAZIO, motivo: "Asaas em modo simulado" }

  const admin = createAdminClient()
  const { data: h } = await admin
    .from("holdings")
    .select(
      "id, asaas_customer_id, doc_cpf_cnpj, razao_social, nf_cep, nf_logradouro, nf_numero, nf_bairro, nf_cidade, nf_uf",
    )
    .eq("id", holdingId)
    .maybeSingle()

  const customerId = (h as Record<string, unknown> | null)?.asaas_customer_id as
    | string
    | undefined
  if (!h || !customerId) {
    return { ...VAZIO, motivo: "Cliente sem cadastro no Asaas" }
  }

  const c = await asaasGetCustomer(customerId)
  if (!c) return { ...VAZIO, motivo: "Cliente não encontrado no Asaas" }

  const atual = h as Record<string, unknown>
  const patch: Record<string, string> = {}
  const preenchidos: string[] = []
  const divergentes: string[] = []

  const espelhar = (campo: string, valorAsaas: unknown, rotulo: string) => {
    const novo = String(valorAsaas ?? "").trim()
    if (!novo) return
    const velho = String(atual[campo] ?? "").trim()
    if (!velho) {
      patch[campo] = novo
      preenchidos.push(rotulo)
    } else if (velho !== novo) {
      divergentes.push(`${rotulo}: aqui "${velho}", no Asaas "${novo}"`)
    }
  }

  espelhar("doc_cpf_cnpj", c.cpfCnpj, "CNPJ")
  espelhar("razao_social", c.name, "razão social")
  espelhar("nf_cep", c.postalCode, "CEP")
  espelhar("nf_logradouro", c.address, "endereço")
  espelhar("nf_numero", c.addressNumber, "número")
  espelhar("nf_bairro", c.province, "bairro")
  espelhar("nf_cidade", c.cityName, "cidade")
  espelhar("nf_uf", c.state, "UF")

  if (Object.keys(patch).length > 0) {
    const { error } = await admin
      .from("holdings")
      .update(patch)
      .eq("id", holdingId)
    if (error) return { ...VAZIO, motivo: error.message }
  }

  if (divergentes.length > 0) {
    console.log(
      `[asaas] cadastro divergente na holding ${holdingId}: ${divergentes.join(" · ")}`,
    )
  }

  return { preenchidos, divergentes }
}
