import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"

export type LojaParaConectar = {
  unitId: string
  code: string
  name: string
  city: string | null
  /** Sem CNPJ a loja não tem como casar com a do iFood — precisa preencher. */
  cnpj: string | null
}

export type PanoramaConexaoIfood = {
  faltando: LojaParaConectar[]
  /** Já pediram e estão no meio do caminho — não entram na lista de convite. */
  emAndamento: number
  conectadas: number
  totalComIfood: number
}

/**
 * O que ainda não puxa dados sozinho do iFood, na empresa de quem está logado.
 *
 * "Faltando" é uma definição estreita de propósito: loja com iFood ligado, sem
 * vínculo de API e SEM solicitação em aberto. Quem já pediu não pode reaparecer
 * no convite — receber "conecte sua loja" no dia seguinte a ter pedido faz o
 * aviso perder a credibilidade inteira.
 */
export async function getPanoramaConexaoIfood(
  /** Só pra script/diagnóstico. Na tela é sempre a empresa de quem está logado. */
  holdingIdForcada?: string,
): Promise<PanoramaConexaoIfood> {
  const vazio: PanoramaConexaoIfood = {
    faltando: [],
    emAndamento: 0,
    conectadas: 0,
    totalComIfood: 0,
  }

  const holdingId = holdingIdForcada ?? (await getCurrentHoldingId())
  if (!holdingId) return vazio

  const admin = createAdminClient()

  const { data: brands } = await admin
    .from("brands")
    .select("id")
    .eq("holding_id", holdingId)
  const brandIds = (brands ?? []).map((b) => b.id)
  if (brandIds.length === 0) return vazio

  const { data: units } = await admin
    .from("units")
    .select("id, code, name, city, cnpj")
    .in("brand_id", brandIds)
    .eq("active", true)
    .order("code")
  if (!units || units.length === 0) return vazio

  const unitIds = units.map((u) => u.id)

  const [{ data: plats }, { data: pedidos }] = await Promise.all([
    admin
      .from("unit_platforms")
      .select("unit_id, api_store_id")
      .eq("platform", "ifood")
      .eq("active", true)
      .in("unit_id", unitIds),
    admin
      .from("ifood_activation_requests")
      .select("unit_id")
      .eq("holding_id", holdingId)
      .in("status", ["pendente", "solicitada"]),
  ])

  const comPedidoAberto = new Set(
    (pedidos ?? []).map((p) => p.unit_id as string).filter(Boolean),
  )

  const porUnidade = new Map(units.map((u) => [u.id, u]))
  const faltando: LojaParaConectar[] = []
  let conectadas = 0
  let emAndamento = 0

  for (const p of plats ?? []) {
    const u = porUnidade.get(p.unit_id as string)
    if (!u) continue
    if (p.api_store_id) {
      conectadas++
      continue
    }
    if (comPedidoAberto.has(u.id)) {
      emAndamento++
      continue
    }
    faltando.push({
      unitId: u.id,
      code: u.code,
      name: u.name,
      city: u.city,
      cnpj: u.cnpj,
    })
  }

  // Ordena aqui e não na consulta: o laço percorre `unit_platforms`, que não
  // tem ordem nenhuma — sem isto a lista sai 10, 38, 40, 35, 15…
  faltando.sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true }))

  return {
    faltando,
    emAndamento,
    conectadas,
    totalComIfood: (plats ?? []).length,
  }
}
