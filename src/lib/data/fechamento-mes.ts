/**
 * "Seu mês fechou com dias faltando" — o que cobrar de quem importa planilha.
 *
 * A régua de dias-sem-importar não serve aqui: a Conciliação do iFood e a
 * fatura da Keeta são MENSAIS, então quem importa uma vez por mês está certo e
 * ficaria vermelho 25 dias seguidos. O que interessa é a cobertura do mês
 * fechado — e o único momento em que o cliente precisa agir é logo depois da
 * virada, antes de ele olhar o resultado.
 *
 * Só entra plataforma alimentada por planilha. Se o dado vem por API e parou,
 * o problema é nosso: cobrar o cliente por isso é transferir angústia.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/** Dia do mês em que o e-mail de fechamento sai. */
export const DIA_DO_ENVIO = 3
/** Dias faltando a partir dos quais vale incomodar o cliente. */
export const MINIMO_DIAS_FALTANDO = 5

export type LojaIncompleta = {
  loja: string
  plataforma: "ifood" | "99food" | "keeta"
  ultimoDia: string
  diasFaltando: number
  /** ESTIMATIVA: média diária do próprio mês × dias faltando. */
  valorEstimado: number
}

export type FechamentoIncompleto = {
  holdingId: string
  holdingNome: string
  lojas: LojaIncompleta[]
  totalEstimado: number
}

/**
 * Percorre todas as holdings e devolve só as que fecharam o mês com buraco.
 * Holding sem pendência não aparece — e-mail que sai "avisando que está tudo
 * certo" todo mês é o primeiro a virar filtro na caixa de entrada.
 */
export async function getFechamentosIncompletos(
  year: number,
  month: number,
): Promise<FechamentoIncompleto[]> {
  const admin = createAdminClient()

  const { data: hs } = await admin.from("holdings").select("id, name")
  const { data: brands } = await admin.from("brands").select("id, holding_id")
  const { data: units } = await admin.from("units").select("id, code, name, brand_id")

  const holdingDaBrand = new Map(
    ((brands ?? []) as { id: string; holding_id: string }[]).map((b) => [
      b.id,
      b.holding_id,
    ]),
  )
  const unidades = (units ?? []) as {
    id: string
    code: string
    name: string
    brand_id: string
  }[]

  const { data: faltas, error } = await admin.rpc("fechamento_mes_faltando", {
    p_unit_ids: unidades.map((u) => u.id),
    p_year: year,
    p_month: month,
  })
  if (error) {
    console.error("getFechamentosIncompletos:", error.message)
    return []
  }

  const porUnidade = new Map(unidades.map((u) => [u.id, u]))
  const porHolding = new Map<string, LojaIncompleta[]>()

  for (const f of (faltas ?? []) as {
    unit_id: string
    plataforma: string
    ultimo_dia: string
    dias_faltando: number
    media_diaria: number | string
  }[]) {
    if (f.dias_faltando < MINIMO_DIAS_FALTANDO) continue
    const u = porUnidade.get(f.unit_id)
    if (!u) continue
    const h = holdingDaBrand.get(u.brand_id)
    if (!h) continue

    if (!porHolding.has(h)) porHolding.set(h, [])
    porHolding.get(h)!.push({
      loja: u.code ? `${u.code} · ${u.name}` : u.name,
      plataforma: f.plataforma as LojaIncompleta["plataforma"],
      ultimoDia: f.ultimo_dia,
      diasFaltando: f.dias_faltando,
      valorEstimado: Number(f.media_diaria) * f.dias_faltando,
    })
  }

  const nomeHolding = new Map(
    ((hs ?? []) as { id: string; name: string }[]).map((h) => [h.id, h.name]),
  )

  return [...porHolding.entries()]
    .map(([holdingId, lojas]) => ({
      holdingId,
      holdingNome: nomeHolding.get(holdingId) ?? "sua empresa",
      // Maior buraco primeiro: é por ele que a pessoa começa.
      lojas: lojas.sort((a, b) => b.valorEstimado - a.valorEstimado),
      totalEstimado: lojas.reduce((s, l) => s + l.valorEstimado, 0),
    }))
    .filter((f) => f.lojas.length > 0)
}
