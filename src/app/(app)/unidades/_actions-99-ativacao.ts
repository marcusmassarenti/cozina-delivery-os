"use server"

/**
 * Solicitação de ativação do 99 Food via API — lado do CLIENTE.
 *
 * Gêmea de `_actions-ifood-ativacao.ts`. O 99 também não tem self-service: a
 * credencial do app é uma só (nossa) e gera um token POR LOJA, identificada
 * pelo `app_shop_id` — um valor definido no portal do 99. A loja precisa ser
 * autorizada ao nosso app lá antes de qualquer chamada funcionar.
 *
 * Esta action só registra o pedido na fila e avisa por e-mail. Quem fala com o
 * 99 somos nós.
 */
import { revalidatePath } from "next/cache"

import { requireAdmin } from "@/lib/auth/guards"
import { normalizarCnpj } from "@/lib/cnpj"
import {
  getAccessibleUnitIds,
  getCurrentHoldingId,
} from "@/lib/auth/permissions"
import { avisarSolicitacaoNinefood } from "@/lib/ninefood/avisar-solicitacao"

export type SolicitacaoNinefoodState = {
  ok: boolean
  message?: string
}


export async function solicitarAtivacaoNinefood(
  _prev: SolicitacaoNinefoodState,
  formData: FormData,
): Promise<SolicitacaoNinefoodState> {
  let userId: string
  let admin: Awaited<ReturnType<typeof requireAdmin>>["admin"]
  try {
    const auth = await requireAdmin()
    userId = auth.userId
    admin = auth.admin
  } catch {
    return { ok: false, message: "Só administradores podem solicitar a conexão." }
  }

  const holdingId = await getCurrentHoldingId()
  if (!holdingId) {
    return { ok: false, message: "Não consegui identificar a sua empresa." }
  }

  // Mesmo par de nomes do iFood: "cnpj_api_99" é o campo próprio do bloco, e
  // "cnpj" é o do cadastro (usado quando o cliente já preencheu lá em cima).
  const cnpj = normalizarCnpj(
    String(formData.get("cnpj_api_99") ?? formData.get("cnpj") ?? ""),
  )
  if (!cnpj) {
    return {
      ok: false,
      message:
        "Esse CNPJ não é válido — algum número está trocado. Confira no cartão CNPJ e digite de novo.",
    }
  }

  const unitId = String(formData.get("unit_id") ?? "").trim()
  if (!unitId) return { ok: false, message: "Unidade não informada." }
  const acessiveis = await getAccessibleUnitIds()
  if (acessiveis !== null && !acessiveis.includes(unitId)) {
    return { ok: false, message: "Unidade inválida." }
  }

  // Opcional — ajuda o 99 a achar a loja mais rápido quando o cliente sabe.
  // Obrigatório no servidor também: o `required` do HTML cai fora se alguém
  // mandar o form por fora, e sem o nome o vínculo automático não fecha.
  const loja99 = String(formData.get("loja_99") ?? "").trim().slice(0, 120)
  if (!loja99) {
    return {
      ok: false,
      message:
        "Informe o nome da loja como aparece no painel do 99 — é por ele que a conexão se fecha sozinha.",
    }
  }

  // Evita pedido duplicado do mesmo CNPJ ainda em andamento.
  const { data: aberta } = await admin
    .from("ninefood_activation_requests")
    .select("id, status")
    .eq("holding_id", holdingId)
    .eq("cnpj", cnpj)
    .in("status", ["pendente", "solicitada"])
    .maybeSingle()
  if (aberta) {
    return {
      ok: false,
      message:
        aberta.status === "pendente"
          ? "Já existe uma solicitação em análise para esse CNPJ."
          : "Esse CNPJ já foi solicitado ao 99 — estamos aguardando a autorização.",
    }
  }

  const { error } = await admin.from("ninefood_activation_requests").insert({
    holding_id: holdingId,
    unit_id: unitId,
    cnpj,
    loja_99: loja99,
    requested_by: userId,
  })
  if (error) {
    return { ok: false, message: `Falha ao registrar: ${error.message}` }
  }

  // Sem await: o cliente não espera o Resend pra ver que o pedido entrou.
  void avisarSolicitacaoNinefood(holdingId, { cnpj, unitId, loja99 })

  revalidatePath("/unidades")
  return {
    ok: true,
    message:
      "Solicitação registrada! Vamos pedir a autorização ao 99 e você acompanha o status aqui.",
  }
}

/**
 * "Já autorizei no 99" — o lojista avisa que concluiu no portal deles.
 *
 * Sem este passo o processo dependia de ele mandar mensagem pro Marcus, e é
 * exatamente aí que travava sem ninguém perceber: o cliente achava que tinha
 * terminado, e do nosso lado nada acontecia.
 *
 * O que ele NÃO faz: descobrir o `app_shop_id`. A API do 99 não tem endpoint
 * de "liste minhas lojas" — a chave só aparece quando o primeiro webhook da
 * loja chega. Por isso o fechamento é do outro lado: o cron de webhooks casa
 * o `shop_name` que chegou com esta solicitação e vincula sozinho
 * (process-99-webhooks). Aqui a gente só carimba que o lojista fez a parte
 * dele e avisa quem precisa saber.
 */
export async function confirmarAutorizacaoNinefood(
  _prev: SolicitacaoNinefoodState,
  formData: FormData,
): Promise<SolicitacaoNinefoodState> {
  const unitId = String(formData.get("unit_id") ?? "").trim()
  if (!unitId) return { ok: false, message: "Loja não identificada." }

  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, message: "Conta não identificada." }

  // Mesma porta do solicitar: requireAdmin devolve o client de serviço já
  // com a permissão verificada — o cliente comum não pode carimbar isso.
  const { admin } = await requireAdmin()
  const { data: aberta } = await admin
    .from("ninefood_activation_requests")
    .select("id")
    .eq("holding_id", holdingId)
    .eq("unit_id", unitId)
    .in("status", ["pendente", "solicitada"])
    .maybeSingle()

  if (!aberta) {
    return {
      ok: false,
      message:
        "Não achei um pedido de conexão em aberto pra esta loja. Clique em Solicitar conexão primeiro.",
    }
  }

  const { error } = await admin
    .from("ninefood_activation_requests")
    .update({
      status: "solicitada",
      nota: `Cliente confirmou a autorização no portal do 99 em ${new Date().toISOString()}.`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", (aberta as { id: string }).id)
  if (error) return { ok: false, message: `Falha ao registrar: ${error.message}` }

  void avisarSolicitacaoNinefood(holdingId, {
    cnpj: "",
    unitId,
    loja99: "CLIENTE JÁ AUTORIZOU NO PORTAL — falta vincular do nosso lado",
  })

  revalidatePath("/unidades")
  return {
    ok: true,
    message:
      "Anotado! A loja entra sozinha assim que o 99 mandar o primeiro pedido dela. Se em 24h não aparecer, a gente te procura.",
  }
}
