import { ClipboardList } from "lucide-react"

import { assertCanView, getCurrentHoldingId } from "@/lib/auth/permissions"
import { listarAtendimentos } from "@/lib/data/atendimentos"
import { createAdminClient } from "@/lib/supabase/admin"

import {
  AtendimentosView,
  type LojaSimples,
} from "./_components/atendimentos-view"

export const metadata = { title: "Atendimentos · Delivery OS" }

/**
 * T6 — o registro do que a agência faz em cada loja.
 *
 * O histórico é append-only de propósito: o pedido foi "deixar gravado cada
 * passo", e passo que pode ser reescrito não serve de prova quando o lojista
 * cobra o que foi feito três meses atrás.
 */
export default async function AtendimentosPage({
  searchParams,
}: {
  searchParams: Promise<{ resolvidos?: string }>
}) {
  const sp = await searchParams
  await assertCanView("unidades")
  const incluirResolvidos = sp.resolvidos === "1"

  const [atendimentos, lojas] = await Promise.all([
    listarAtendimentos({ incluirResolvidos }),
    listarLojas(),
  ])

  return (
    <div className="flex flex-1 flex-col gap-4 bg-muted/30 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ClipboardList className="size-6 text-muted-foreground" />
          Atendimentos
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Cada passo feito na loja, registrado e sem apagar.
        </p>
      </div>

      <AtendimentosView
        atendimentos={atendimentos}
        lojas={lojas}
        mostrandoResolvidos={incluirResolvidos}
      />
    </div>
  )
}

async function listarLojas(): Promise<LojaSimples[]> {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return []
  const { data } = await createAdminClient()
    .from("units")
    .select("id, code, name, brands!inner(holding_id)")
    .eq("brands.holding_id", holdingId)
    .order("code")
  return ((data ?? []) as unknown as LojaSimples[]).map((u) => ({
    id: u.id,
    code: u.code,
    name: u.name,
  }))
}
