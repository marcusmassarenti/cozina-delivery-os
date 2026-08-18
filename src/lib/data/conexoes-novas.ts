import "server-only"

/**
 * Lojas que passaram a ter 99 Food ou Cardápio Web conectados.
 *
 * ── POR QUE ISSO EXISTE (Marcus, 18/08/26) ───────────────────────────────
 * "precisa avisar o cliente que a 99 está conectada e cardapio web também
 * igual o ifood... porque o cliente fica perdido."
 *
 * Só o iFood avisava — e ele avisa porque tem uma máquina de solicitação
 * (`ifood_activation_requests`) com estado. As outras duas não têm nada
 * parecido: no 99 o vínculo nasce numa linha de `ninefood_store_links`, no
 * Cardápio Web numa instalação. Nenhum dos dois avisava ninguém.
 *
 * O sinal aqui é o mesmo em espírito: "esta loja ganhou esta plataforma
 * recentemente". Recorte de 7 dias, igual ao do iFood — passada a semana o
 * cliente já sabe, e o aviso vira entulho na home.
 */
import { createAdminClient } from "@/lib/supabase/admin"

export type ConexaoNova = {
  plataforma: "99food" | "cardapioweb"
  unitId: string
  unitCode: string
  unitName: string
  /** ISO da conexão — o front decide se ainda é novidade. */
  conectadaEm: string
  /** Já entrou dado? Muda a mensagem de "conectada" pra "já trazendo dado". */
  temDado: boolean
}

const DIAS = 7

export async function getConexoesNovas(
  unitIds: string[],
): Promise<ConexaoNova[]> {
  if (unitIds.length === 0) return []
  const admin = createAdminClient()
  const corte = new Date(Date.now() - DIAS * 86_400_000).toISOString()
  const out: ConexaoNova[] = []

  const { data: units } = await admin
    .from("units")
    .select("id, code, name")
    .in("id", unitIds)
  const porId = new Map(
    ((units ?? []) as { id: string; code: string; name: string }[]).map((u) => [
      u.id,
      u,
    ]),
  )

  // ── 99 Food
  const { data: links } = await admin
    .from("ninefood_store_links")
    .select("unit_id, app_shop_id, created_at")
    .in("unit_id", unitIds)
    .gte("created_at", corte)
  for (const l of (links ?? []) as {
    unit_id: string
    app_shop_id: string
    created_at: string
  }[]) {
    const u = porId.get(l.unit_id)
    if (!u) continue
    const { count } = await admin
      .from("ninefood_api_bill")
      .select("app_shop_id", { count: "exact", head: true })
      .eq("app_shop_id", l.app_shop_id)
    out.push({
      plataforma: "99food",
      unitId: l.unit_id,
      unitCode: u.code,
      unitName: u.name,
      conectadaEm: l.created_at,
      temDado: (count ?? 0) > 0,
    })
  }

  // ── Cardápio Web
  const { data: installs } = await admin
    .from("cardapioweb_installs")
    .select("unit_id, created_at")
    .in("unit_id", unitIds)
    .gte("created_at", corte)
  for (const i of (installs ?? []) as {
    unit_id: string
    created_at: string
  }[]) {
    const u = porId.get(i.unit_id)
    if (!u) continue
    const { count } = await admin
      .from("cardapioweb_pedidos")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", i.unit_id)
    out.push({
      plataforma: "cardapioweb",
      unitId: i.unit_id,
      unitCode: u.code,
      unitName: u.name,
      conectadaEm: i.created_at,
      temDado: (count ?? 0) > 0,
    })
  }

  return out.sort((a, b) => b.conectadaEm.localeCompare(a.conectadaEm))
}
