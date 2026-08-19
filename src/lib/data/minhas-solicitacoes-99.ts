import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getAccessibleUnitIds } from "@/lib/auth/permissions"

export type MinhaSolicitacao99 = {
  id: string
  unitId: string | null
  unitCode: string | null
  unitName: string | null
  cnpj: string
}

/**
 * Pedidos do 99 esperando a autorização DO CLIENTE.
 *
 * ── POR QUE (Marcus, 19/08/26) ───────────────────────────────────────────
 * O 99 só devolve a loja no `/v1/shop/list` depois que o lojista autoriza o
 * Delivery OS no portal dele. Enquanto isso não acontece, do nosso lado não há
 * o que fazer — e do lado dele não havia nada dizendo que faltava algo. A loja
 * ficava parada e os dois lados achavam que a bola era do outro.
 *
 * Só `solicitada`: `pendente` é pedido que ainda não passou por nós, e cobrar
 * o cliente de uma coisa que nós não pedimos é o jeito mais rápido de ensinar
 * ele a ignorar os avisos.
 */
export async function getMinhasSolicitacoes99(): Promise<MinhaSolicitacao99[]> {
  const acessiveis = await getAccessibleUnitIds()
  // `null` = superadmin (vê tudo). A faixa é do CLIENTE: mostrá-la pro dono da
  // plataforma encheria a tela dele com pendências que não são dele.
  if (acessiveis === null || acessiveis.length === 0) return []

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("ninefood_activation_requests")
    .select("id, cnpj, unit_id, units(code, name)")
    .eq("status", "solicitada")
    .in("unit_id", acessiveis)
  if (error) {
    console.error("getMinhasSolicitacoes99:", error.message)
    return []
  }

  return ((data ?? []) as unknown as {
    id: string
    cnpj: string
    unit_id: string | null
    units: { code: string; name: string } | null
  }[]).map((r) => ({
    id: r.id,
    unitId: r.unit_id,
    unitCode: r.units?.code ?? null,
    unitName: r.units?.name ?? null,
    cnpj: r.cnpj,
  }))
}
