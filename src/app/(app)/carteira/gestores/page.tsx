import { UsersRound } from "lucide-react"

import { assertCanView } from "@/lib/auth/permissions"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import { rankingDeGestores } from "@/lib/data/carteira"
import { createAdminClient } from "@/lib/supabase/admin"
import { formatRangeLabel } from "@/lib/period"
import { readPeriod } from "@/lib/period-helpers"
import { PeriodSelector } from "@/components/shared/period-selector"

import {
  GestoresView,
  type LojaDaCarteira,
} from "./_components/gestores-view"

export const metadata = { title: "Gestores · Delivery OS" }

/**
 * Ranking de gestores da carteira.
 *
 * Fase 2 do painel da agência (docs/painel-agencia-plano.md). Responde
 * "quem cuida do quê" e "quanto cada um traz" — a segunda pergunta é a que
 * vira bonificação.
 */
export default async function GestoresPage({
  searchParams,
}: {
  searchParams: Promise<{
    periodo?: string
    inicio?: string
    fim?: string
  }>
}) {
  const sp = await searchParams
  await assertCanView("unidades")
  const { range: periodRange } = readPeriod(sp)

  const holdingId = await getCurrentHoldingId()
  const [gestores, lojas] = await Promise.all([
    rankingDeGestores(periodRange),
    listarLojasDaCarteira(holdingId),
  ])

  return (
    <div className="flex flex-1 flex-col gap-4 bg-muted/30 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <UsersRound className="size-6 text-muted-foreground" />
            Gestores
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Quem cuida de cada loja, e quanto cada carteira traz no período.
          </p>
        </div>
        <PeriodSelector current={periodRange} />
      </div>

      <GestoresView
        gestores={gestores}
        lojas={lojas}
        periodo={formatRangeLabel(periodRange)}
      />
    </div>
  )
}

/**
 * As lojas da agência, com o gestor de cada uma.
 *
 * ⚠️ Filtra pela holding da SESSÃO. É a mesma trava da action: loja de outro
 * cliente não pode nem aparecer no seletor, quanto mais ser atribuída.
 */
async function listarLojasDaCarteira(
  holdingId: string | null,
): Promise<LojaDaCarteira[]> {
  if (!holdingId) return []
  const { data } = await createAdminClient()
    .from("units")
    .select("id, code, name, active, gestor_id, brands!inner(holding_id)")
    .eq("brands.holding_id", holdingId)
    .order("code")

  return ((data ?? []) as unknown as {
    id: string
    code: string
    name: string
    active: boolean
    gestor_id: string | null
  }[]).map((u) => ({
    id: u.id,
    code: u.code,
    name: u.name,
    gestorId: u.gestor_id,
    ativa: u.active,
  }))
}
