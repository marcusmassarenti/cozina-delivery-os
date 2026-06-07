import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { isSuperadmin } from "@/lib/auth/permissions"

/**
 * Painel de Dono (super-admin) — visão de TODOS os clientes (holdings) da
 * plataforma. Só o super-admin chega aqui; mesmo assim, guardamos por dentro
 * (defesa em profundidade) — se não for super-admin, devolve vazio.
 */
export type ClientOverview = {
  id: string
  name: string
  slug: string
  createdAt: string
  brands: number
  units: number
  activeUnits: number
  users: number
}

export type PlatformTotals = {
  clients: number
  units: number
  activeUnits: number
  users: number
}

export async function getClientsOverview(): Promise<{
  clients: ClientOverview[]
  totals: PlatformTotals
}> {
  const empty = {
    clients: [] as ClientOverview[],
    totals: { clients: 0, units: 0, activeUnits: 0, users: 0 },
  }
  if (!(await isSuperadmin())) return empty

  const admin = createAdminClient()
  const [holdingsRes, brandsRes, unitsRes, accessRes] = await Promise.all([
    admin.from("holdings").select("id, name, slug, created_at").order("created_at"),
    admin.from("brands").select("id, holding_id"),
    admin.from("units").select("id, brand_id, active"),
    admin.from("user_unit_access").select("user_id, scope_type, scope_id"),
  ])

  const holdings = holdingsRes.data ?? []
  const brands = brandsRes.data ?? []
  const units = unitsRes.data ?? []
  const accesses = accessRes.data ?? []

  // brand → holding  e  holding → brands
  const brandHolding = new Map<string, string>()
  const brandsByHolding = new Map<string, Set<string>>()
  for (const b of brands) {
    brandHolding.set(b.id, b.holding_id)
    const set = brandsByHolding.get(b.holding_id) ?? new Set<string>()
    set.add(b.id)
    brandsByHolding.set(b.holding_id, set)
  }

  // unit → holding  +  contagens
  const unitHolding = new Map<string, string>()
  const unitCount = new Map<string, number>()
  const activeUnitCount = new Map<string, number>()
  for (const u of units) {
    const h = brandHolding.get(u.brand_id)
    if (!h) continue
    unitHolding.set(u.id, h)
    unitCount.set(h, (unitCount.get(h) ?? 0) + 1)
    if (u.active) activeUnitCount.set(h, (activeUnitCount.get(h) ?? 0) + 1)
  }

  // usuários distintos por holding (qualquer escopo que aponte pra ela)
  const usersByHolding = new Map<string, Set<string>>()
  const addUser = (h: string, uid: string) => {
    const set = usersByHolding.get(h) ?? new Set<string>()
    set.add(uid)
    usersByHolding.set(h, set)
  }
  for (const a of accesses) {
    if (!a.scope_id) continue
    if (a.scope_type === "holding") addUser(a.scope_id, a.user_id)
    else if (a.scope_type === "brand") {
      const h = brandHolding.get(a.scope_id)
      if (h) addUser(h, a.user_id)
    } else if (a.scope_type === "unit") {
      const h = unitHolding.get(a.scope_id)
      if (h) addUser(h, a.user_id)
    }
  }

  const clients: ClientOverview[] = holdings.map((h) => ({
    id: h.id,
    name: h.name,
    slug: h.slug,
    createdAt: h.created_at,
    brands: brandsByHolding.get(h.id)?.size ?? 0,
    units: unitCount.get(h.id) ?? 0,
    activeUnits: activeUnitCount.get(h.id) ?? 0,
    users: usersByHolding.get(h.id)?.size ?? 0,
  }))

  const totals: PlatformTotals = {
    clients: clients.length,
    units: clients.reduce((s, c) => s + c.units, 0),
    activeUnits: clients.reduce((s, c) => s + c.activeUnits, 0),
    users: clients.reduce((s, c) => s + c.users, 0),
  }

  return { clients, totals }
}
