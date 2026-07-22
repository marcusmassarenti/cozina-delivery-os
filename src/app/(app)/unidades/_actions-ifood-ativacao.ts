"use server"

/**
 * Solicitação de ativação do iFood via API — lado do CLIENTE.
 *
 * O app do iFood é centralizado: não existe código self-service. O que o
 * cliente pode fazer é PEDIR a conexão informando o CNPJ da loja; a
 * solicitação real acontece no Portal do Desenvolvedor (feita pelo admin
 * da plataforma) e a aprovação final é do Proprietário, no Portal do
 * Parceiro dele. Esta action só registra o pedido na fila.
 */
import { revalidatePath } from "next/cache"

import { requireAdmin } from "@/lib/auth/guards"
import {
  getAccessibleUnitIds,
  getCurrentHoldingId,
} from "@/lib/auth/permissions"

export type SolicitacaoIfoodState = {
  ok: boolean
  message?: string
}

/** Aceita CNPJ com ou sem máscara; guarda só os 14 dígitos. */
function normalizarCnpj(raw: string): string | null {
  const digitos = raw.replace(/\D/g, "")
  return digitos.length === 14 ? digitos : null
}

export async function solicitarAtivacaoIfood(
  _prev: SolicitacaoIfoodState,
  formData: FormData,
): Promise<SolicitacaoIfoodState> {
  let userId: string
  let admin: Awaited<ReturnType<typeof requireAdmin>>["admin"]
  try {
    const auth = await requireAdmin()
    userId = auth.userId
    admin = auth.admin
  } catch {
    return {
      ok: false,
      message: "Só administradores podem solicitar a conexão.",
    }
  }

  const holdingId = await getCurrentHoldingId()
  if (!holdingId) {
    return { ok: false, message: "Não consegui identificar a sua empresa." }
  }

  const cnpj = normalizarCnpj(String(formData.get("cnpj") ?? ""))
  if (!cnpj) {
    return { ok: false, message: "CNPJ inválido — confira os 14 dígitos." }
  }

  // O pedido nasce DA página da unidade, então ela é obrigatória — e
  // precisa ser uma unidade que o usuário realmente enxerga.
  const unitId = String(formData.get("unit_id") ?? "").trim()
  if (!unitId) return { ok: false, message: "Unidade não informada." }
  const acessiveis = await getAccessibleUnitIds()
  if (acessiveis !== null && !acessiveis.includes(unitId)) {
    return { ok: false, message: "Unidade inválida." }
  }

  // Evita pedido duplicado do mesmo CNPJ ainda em andamento.
  const { data: aberta } = await admin
    .from("ifood_activation_requests")
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
          : "Esse CNPJ já foi solicitado — falta aprovar no seu Portal do Parceiro.",
    }
  }

  const { error } = await admin.from("ifood_activation_requests").insert({
    holding_id: holdingId,
    unit_id: unitId,
    cnpj,
    requested_by: userId,
  })
  if (error) {
    return { ok: false, message: `Falha ao registrar: ${error.message}` }
  }

  revalidatePath("/unidades")
  return {
    ok: true,
    message:
      "Solicitação registrada! Vamos conectar sua loja e você acompanha o status aqui.",
  }
}
