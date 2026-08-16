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

/**
 * Registra o que aconteceu, pra o resultado ser VERIFICÁVEL.
 *
 * ⚠️ Existe porque eu fiquei dois turnos adivinhando por que o CNPJ da DG não
 * vinha: podia ser o deploy que não subiu, a chave ausente, o cliente sem CNPJ
 * do lado do Asaas ou a chamada falhando. Sem registro, cada hipótese custava
 * um "abre de novo e me avisa" — e o Marcus fazendo o trabalho de
 * instrumentação que era meu.
 *
 * Grava em `cron_runs` de propósito: é a tabela de "rodou, e deu nisso" que eu
 * já sei ler, e um erro aqui aparece no relatório de saúde sozinho.
 */
async function registrar(
  holdingId: string,
  r: ResultadoEspelho & { erro?: string },
): Promise<void> {
  try {
    await createAdminClient().from("cron_runs").insert({
      nome: "espelho-asaas",
      iniciado_em: new Date().toISOString(),
      terminado_em: new Date().toISOString(),
      ok: !r.erro,
      erro: r.erro ?? null,
      resumo: {
        holdingId,
        preenchidos: r.preenchidos,
        divergentes: r.divergentes,
        motivo: r.motivo ?? null,
      },
    })
  } catch {
    // Registro é diagnóstico: nunca pode derrubar o que ele observa.
  }
}

export async function espelharCadastroDoAsaas(
  holdingId: string,
): Promise<ResultadoEspelho> {
  // Sem chave (dev local), o cliente do Asaas devolve dado simulado. Espelhar
  // isso encheria a base de "Cliente (simulado)" e "00000000000".
  if (asaasIsMock()) {
    const r = { ...VAZIO, motivo: "ASAAS_API_KEY ausente (modo simulado)" }
    await registrar(holdingId, r)
    return r
  }

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
    const r = { ...VAZIO, motivo: "Cliente sem asaas_customer_id" }
    await registrar(holdingId, r)
    return r
  }

  const c = await asaasGetCustomer(customerId)
  if (!c) {
    // `asaasGetCustomer` engole o erro e devolve null: pode ser id inexistente,
    // chave sem permissão ou a API fora. O registro pelo menos separa "não
    // achou" de "não tentou".
    const r = { ...VAZIO, motivo: `Asaas não devolveu o cliente ${customerId}` }
    await registrar(holdingId, r)
    return r
  }
  if (!String(c.cpfCnpj ?? "").trim()) {
    const r = { ...VAZIO, motivo: `Cliente ${customerId} está sem CNPJ no Asaas` }
    await registrar(holdingId, r)
    return r
  }

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
    if (error) {
      const r = { ...VAZIO, erro: error.message, motivo: error.message }
      await registrar(holdingId, r)
      return r
    }
  }

  if (divergentes.length > 0) {
    console.log(
      `[asaas] cadastro divergente na holding ${holdingId}: ${divergentes.join(" · ")}`,
    )
  }

  const r = { preenchidos, divergentes }
  await registrar(holdingId, r)
  return r
}
