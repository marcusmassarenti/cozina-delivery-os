import { ClipboardList } from "lucide-react"

import { assertCanView, getCurrentHoldingId } from "@/lib/auth/permissions"
import {
  listarAtendimentos,
  listarGestoresAtivos,
  meuGestorId,
} from "@/lib/data/atendimentos"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

import {
  AtendimentosView,
  type LojaSimples,
} from "./_components/atendimentos-view"
import { TourButton } from "@/components/onboarding/tour-button"
import { TOUR_ATENDIMENTOS } from "../_tours"

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
  searchParams: Promise<{ resolvidos?: string; gestor?: string }>
}) {
  const sp = await searchParams
  await assertCanView("unidades")
  const incluirResolvidos = sp.resolvidos === "1"

  const {
    data: { user },
  } = await (await createClient()).auth.getUser()
  const [atendimentos, lojas, gestores, meu] = await Promise.all([
    listarAtendimentos({ incluirResolvidos }),
    listarLojas(),
    listarGestoresAtivos(),
    meuGestorId(user?.id ?? null),
  ])
  // Filtro por responsável: o da URL (link que o gestor salva) > o gestor
  // ligado ao login de quem abriu > todos.
  const gestorInicial = sp.gestor ?? meu ?? "todos"

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
        <div className="mt-2">
          <TourButton steps={TOUR_ATENDIMENTOS} />
        </div>
      </div>

      <AtendimentosView
        atendimentos={atendimentos}
        lojas={lojas}
        gestores={gestores}
        gestorInicial={gestorInicial}
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
    .select("id, code, name, gestor_id, brands!inner(holding_id)")
    .eq("brands.holding_id", holdingId)
    .order("code")
  return (
    (data ?? []) as unknown as {
      id: string
      code: string
      name: string
      gestor_id: string | null
    }[]
  ).map((u) => ({
    id: u.id,
    code: u.code,
    name: u.name,
    gestorId: u.gestor_id,
  }))
}
