import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import type { PlatformId } from "@/components/platform-logo"
import { getRealMonthlyForUnitsForRange } from "./range-aggregation"

/**
 * A carteira em forma de lista — a tela onde a agência varre as lojas.
 *
 * Réplica da "Lista de Lojas" do painel da DG Foods: categorias por etapa,
 * filtros por gestor e plataforma, e um cartão por loja com o que a agência
 * precisa saber antes de abrir.
 */

export type LojaDaLista = {
  id: string
  code: string
  name: string
  ativa: boolean
  categoria: "nova" | "ativa" | "pausada"
  plataformas: PlatformId[]
  gestorId: string | null
  gestorNome: string | null
  /** Dias desde a entrada na carteira. */
  diasEmGestao: number | null
  promessaComercial: string | null
  checklistOk: boolean
  cardapioOk: boolean
  /** Média mensal dos últimos 90 dias. `null` = sem dado importado. */
  media3Meses: number | null
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

export async function listarCarteira(): Promise<LojaDaLista[]> {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return []
  const admin = createAdminClient()

  const { data } = await admin
    .from("units")
    .select(
      "id, code, name, active, categoria_carteira, gestor_id, entrada_carteira, promessa_comercial, checklist_ok_em, cardapio_ok_em, brands!inner(holding_id), gestores(nome), unit_platforms(platform, active)",
    )
    .eq("brands.holding_id", holdingId)
    .order("code")

  const linhas = (data ?? []) as unknown as {
    id: string
    code: string
    name: string
    active: boolean
    categoria_carteira: LojaDaLista["categoria"]
    gestor_id: string | null
    entrada_carteira: string | null
    promessa_comercial: string | null
    checklist_ok_em: string | null
    cardapio_ok_em: string | null
    gestores: { nome: string } | null
    unit_platforms: { platform: string; active: boolean }[]
  }[]
  if (linhas.length === 0) return []

  /* UMA chamada de 90 dias pra TODAS as lojas. Pedir loja a loja seriam 183
     idas ao banco pra desenhar uma lista — e a carteira da Prime tem 380 a
     500. É o padrão de performance que este projeto já pagou caro. */
  const ate = new Date()
  const de = new Date()
  de.setUTCDate(de.getUTCDate() - 90)
  const noventa = await getRealMonthlyForUnitsForRange(
    linhas.map((l) => l.id),
    { start: iso(de), end: iso(ate) },
  )

  const hoje = Date.now()
  return linhas.map((l) => {
    const m = noventa.get(l.id)
    // Zero em tudo = sem importação, não "vendeu zero". Mesma régua das
    // outras telas da carteira.
    const temDado = !!m && (m.faturamentoBruto > 0 || m.pedidos > 0)
    return {
      id: l.id,
      code: l.code,
      name: l.name,
      ativa: l.active,
      categoria: l.categoria_carteira ?? "nova",
      plataformas: (l.unit_platforms ?? [])
        .filter((p) => p.active)
        .map((p) => p.platform as PlatformId),
      gestorId: l.gestor_id,
      gestorNome: l.gestores?.nome ?? null,
      diasEmGestao: l.entrada_carteira
        ? Math.floor(
            (hoje - new Date(`${l.entrada_carteira}T12:00:00Z`).getTime()) /
              86400000,
          )
        : null,
      promessaComercial: l.promessa_comercial,
      checklistOk: l.checklist_ok_em !== null,
      cardapioOk: l.cardapio_ok_em !== null,
      media3Meses: temDado ? m!.faturamentoBruto / 3 : null,
    }
  })
}
