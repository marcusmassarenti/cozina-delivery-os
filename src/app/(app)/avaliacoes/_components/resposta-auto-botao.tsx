import { Suspense } from "react"

import { createAdminClient } from "@/lib/supabase/admin"
import { getVisibleUnits } from "@/lib/data/units"
import { getUnidadesSomenteLeitura, userCan } from "@/lib/auth/permissions"

import { RespostaAutoJanela } from "./resposta-auto-janela"
import { RespostaAutomaticaCard } from "./resposta-automatica-card"
import { RespondidasAutoCard } from "./respondidas-auto-card"

/**
 * O botão só aparece quando a janela tem o que mostrar: quem enxerga
 * avaliações e tem ao menos uma loja SUA com a API do iFood (a única
 * plataforma que aceita resposta pela API). Dentro, o cartão de controle e a
 * lista do que foi publicado — cada um com as próprias travas de permissão.
 */
export async function RespostaAutoBotao() {
  if (!(await userCan("avaliacoes", "view"))) return null
  const [units, emprestadas] = await Promise.all([
    getVisibleUnits(),
    getUnidadesSomenteLeitura(),
  ])
  const ids = units.filter((u) => u.active && !emprestadas.has(u.id)).map((u) => u.id)
  if (ids.length === 0) return null

  const admin = createAdminClient()
  const [{ data: comApi }, { count: ligadas }] = await Promise.all([
    admin
      .from("unit_platforms")
      .select("unit_id")
      .eq("platform", "ifood")
      .not("api_store_id", "is", null)
      .in("unit_id", ids)
      .limit(1),
    admin
      .from("units")
      .select("id", { count: "exact", head: true })
      .in("id", ids)
      .eq("resposta_auto_avaliacoes", true),
  ])
  if ((comApi ?? []).length === 0) return null

  return (
    <RespostaAutoJanela ligadas={ligadas ?? 0}>
      <Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Carregando…</p>}>
        <RespostaAutomaticaCard />
      </Suspense>
      <Suspense fallback={null}>
        <RespondidasAutoCard />
      </Suspense>
    </RespostaAutoJanela>
  )
}
