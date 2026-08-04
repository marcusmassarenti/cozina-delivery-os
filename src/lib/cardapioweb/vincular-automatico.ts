import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Vincula a instalação do Cardápio Web à loja, quando não há dúvida possível.
 *
 * Quem conecta pela CW App Store nunca passa pelo nosso seletor de unidade — o
 * lojista clica em Instalar lá e autoriza direto. A instalação nasce sem
 * `unit_id`, e sem isso o faturamento entra no sistema mas não se atribui a
 * loja nenhuma: não aparece no dashboard nem no DRE. Aconteceu com a primeira
 * conexão de produção que tivemos (joao nilson, 04/ago/26 11h43).
 *
 * A regra é deliberadamente burra: **uma instalação sem unidade + a empresa tem
 * exatamente UMA loja ativa → vincula**. Com duas lojas não há como saber qual,
 * e chutar mistura o faturamento de uma na outra — erro que ninguém percebe até
 * fechar o mês. Na dúvida, deixa pro humano.
 *
 * NUNCA sobrescreve vínculo existente. Alguém pode ter vinculado à mão numa
 * loja diferente da óbvia, e passar por cima disso apaga uma decisão humana.
 * Por tocar só em `unit_id` nulo, também é seguro rodar quantas vezes quiser.
 *
 * Devolve o `unit_id` vinculado, ou null se não deu. Devolver o id (e não um
 * sim/não) é o que permite o e-mail de "loja nova conectada" já sair com o nome
 * da unidade em vez de "sem unidade vinculada".
 */
export async function vincularSeObvio(
  installId: string,
): Promise<string | null> {
  const admin = createAdminClient()

  const { data: inst } = await admin
    .from("cardapioweb_installs")
    .select("id, holding_id, unit_id, merchant_name")
    .eq("id", installId)
    .maybeSingle()

  const i = inst as {
    id: string
    holding_id: string | null
    unit_id: string | null
    merchant_name: string | null
  } | null

  if (!i || !i.holding_id) return null
  if (i.unit_id) return null // já vinculada — não mexe

  // Lojas ATIVAS da empresa. Inativa não conta: vincular numa loja fechada
  // esconderia o faturamento no mesmo lugar onde ninguém olha.
  const { data: lojas } = await admin
    .from("units")
    .select("id, code, name, brands!inner(holding_id)")
    .eq("brands.holding_id", i.holding_id)
    .eq("active", true)

  const us = (lojas ?? []) as { id: string; code: string; name: string }[]
  if (us.length !== 1) {
    console.log(
      `[cw-vinculo] ${i.merchant_name ?? installId}: ${us.length} lojas ativas — não dá pra decidir sozinho.`,
    )
    return null
  }

  const loja = us[0]
  const { error } = await admin
    .from("cardapioweb_installs")
    .update({ unit_id: loja.id })
    .eq("id", installId)
    .is("unit_id", null) // corrida: se alguém vinculou nesse meio-tempo, perde pro humano

  if (error) {
    console.error(`[cw-vinculo] falhou em ${installId}: ${error.message}`)
    return null
  }

  console.log(
    `[cw-vinculo] ${i.merchant_name ?? installId} → ${loja.code} · ${loja.name}`,
  )
  return loja.id
}
