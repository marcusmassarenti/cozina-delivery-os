import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Adicional "Resposta automática de avaliações" — o valor que entra na
 * mensalidade (Marcus, 25/09/26).
 *
 * POR LOJA LIGADA: preço × lojas ativas com `resposta_auto_avaliacoes`.
 * Preço = o combinado com o cliente (`holdings.resposta_auto_preco_loja`) ou,
 * se nulo, o padrão da plataforma (`platform_settings`). 0 = cortesia.
 *
 * ⚠️ UM LUGAR SÓ. Quem soma a mensalidade (sincronização da assinatura no
 * Asaas, renovação do 12x, aviso de suspensão) chama ESTA função e passa o
 * resultado pra `mensalidadeDoCliente`. Calcular o adicional em cada um é o
 * caminho pra um deles esquecer — é o modo de falha que mais se repete aqui.
 */

export type AdicionalRespostaAuto = {
  /** Preço por loja em vigor pra este cliente. */
  precoLoja: number
  /** Veio de um valor combinado com o cliente (não do padrão). */
  precoCombinado: boolean
  lojasLigadas: number
  /** precoLoja × lojasLigadas — o que entra na mensalidade. */
  total: number
}

/** Preço padrão da plataforma, por loja. */
export async function precoRespostaAutoPadrao(): Promise<number> {
  const { data } = await createAdminClient()
    .from("platform_settings")
    .select("resposta_auto_preco_loja")
    .maybeSingle()
  const v = data?.resposta_auto_preco_loja
  return v != null ? Number(v) : 25
}

export async function adicionalRespostaAuto(
  holdingId: string,
): Promise<AdicionalRespostaAuto> {
  const admin = createAdminClient()
  const [{ data: h }, padrao, { data: brands }] = await Promise.all([
    admin
      .from("holdings")
      .select("resposta_auto_preco_loja")
      .eq("id", holdingId)
      .maybeSingle(),
    precoRespostaAutoPadrao(),
    admin.from("brands").select("id").eq("holding_id", holdingId),
  ])
  const brandIds = ((brands ?? []) as { id: string }[]).map((b) => b.id)
  let lojasLigadas = 0
  if (brandIds.length > 0) {
    const { count } = await admin
      .from("units")
      .select("id", { count: "exact", head: true })
      .in("brand_id", brandIds)
      .eq("active", true)
      .eq("resposta_auto_avaliacoes", true)
    lojasLigadas = count ?? 0
  }
  const combinado = h?.resposta_auto_preco_loja
  const precoLoja = combinado != null ? Number(combinado) : padrao
  return {
    precoLoja,
    precoCombinado: combinado != null,
    lojasLigadas,
    total: Math.round(precoLoja * lojasLigadas * 100) / 100,
  }
}
