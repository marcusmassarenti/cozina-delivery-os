"use server"

import { revalidatePath } from "next/cache"

import { requireAdmin } from "@/lib/auth/guards"
import { getAccessibleUnitIds, getCurrentHoldingId } from "@/lib/auth/permissions"

import { normalizarCnpj } from "@/lib/cnpj"

export type ConectarLoteState = {
  ok: boolean
  message?: string
  /** Erro por unidade, pra tela marcar a linha em vez de só falhar em bloco. */
  porLoja?: Record<string, string>
}

/**
 * Pede a conexão de várias lojas de uma vez.
 *
 * Existe porque o caminho antigo era loja por loja, dentro da página de cada
 * unidade — com 49 lojas, ninguém repete isso 9 vezes, e foi exatamente por
 * isso que 10 lojas da base nunca conectaram.
 *
 * Falha PARCIAL é o comportamento certo aqui: se 6 das 9 estão em ordem, essas
 * 6 entram na fila e as outras 3 voltam com o motivo na própria linha. Abortar
 * tudo por causa de um CNPJ errado devolveria a pessoa ao ponto de partida.
 */
export async function solicitarConexaoEmLote(
  _prev: ConectarLoteState,
  formData: FormData,
): Promise<ConectarLoteState> {
  let userId: string
  let admin: Awaited<ReturnType<typeof requireAdmin>>["admin"]
  try {
    const auth = await requireAdmin()
    userId = auth.userId
    admin = auth.admin
  } catch {
    return { ok: false, message: "Só administradores podem pedir a conexão." }
  }

  const holdingId = await getCurrentHoldingId()
  if (!holdingId) {
    return { ok: false, message: "Não consegui identificar a sua empresa." }
  }

  const selecionadas = formData.getAll("unidades").map(String).filter(Boolean)
  if (selecionadas.length === 0) {
    return { ok: false, message: "Marque pelo menos uma loja." }
  }

  const acessiveis = await getAccessibleUnitIds()
  const porLoja: Record<string, string> = {}
  let enviadas = 0

  // CNPJs já em uso numa solicitação viva — carregado UMA vez, não por loja.
  const { data: abertas } = await admin
    .from("ifood_activation_requests")
    .select("cnpj")
    .eq("holding_id", holdingId)
    .in("status", ["pendente", "solicitada"])
  const cnpjsEmAberto = new Set((abertas ?? []).map((a) => a.cnpj as string))

  for (const unitId of selecionadas) {
    if (acessiveis !== null && !acessiveis.includes(unitId)) {
      porLoja[unitId] = "Loja fora do seu acesso."
      continue
    }

    // O campo da tela vence o cadastro: é onde a pessoa acabou de digitar o
    // CNPJ da loja que estava sem.
    const digitado = String(formData.get(`cnpj_${unitId}`) ?? "").trim()
    const cnpj = normalizarCnpj(digitado)
    if (!cnpj) {
      porLoja[unitId] = digitado
        ? "CNPJ inválido — algum número está trocado."
        : "Preencha o CNPJ desta loja."
      continue
    }

    if (cnpjsEmAberto.has(cnpj)) {
      porLoja[unitId] = "Esse CNPJ já tem uma solicitação em andamento."
      continue
    }

    // Aproveita a digitação: o CNPJ que ela informou aqui fica no cadastro da
    // unidade. Sem isso, a mesma pessoa teria que digitar de novo lá.
    const { error: upErr } = await admin
      .from("units")
      .update({ cnpj })
      .eq("id", unitId)
      .is("cnpj", null)
    if (upErr) {
      porLoja[unitId] = `Falha ao salvar o CNPJ: ${upErr.message}`
      continue
    }

    const { error } = await admin.from("ifood_activation_requests").insert({
      holding_id: holdingId,
      unit_id: unitId,
      cnpj,
      requested_by: userId,
    })
    if (error) {
      porLoja[unitId] = `Falha ao registrar: ${error.message}`
      continue
    }

    cnpjsEmAberto.add(cnpj)
    enviadas++
  }

  revalidatePath("/conectar-ifood")
  revalidatePath("/inicio")
  revalidatePath("/unidades")

  if (enviadas === 0) {
    return {
      ok: false,
      message: "Nenhuma loja foi enviada — veja o motivo em cada linha.",
      porLoja,
    }
  }

  const falharam = Object.keys(porLoja).length
  return {
    ok: true,
    porLoja,
    message:
      falharam > 0
        ? `${enviadas} ${enviadas === 1 ? "loja entrou" : "lojas entraram"} na fila. ${falharam} ${falharam === 1 ? "ficou" : "ficaram"} de fora — veja o motivo abaixo.`
        : `Pronto! ${enviadas} ${enviadas === 1 ? "loja entrou" : "lojas entraram"} na fila. O próximo passo é aprovar no seu Portal do Parceiro.`,
  }
}
