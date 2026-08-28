import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getRealMonthlyForUnitsForRange } from "./range-aggregation"

/**
 * A loja vista pela agência: fluxo de entrada, promessa, meta e carteira.
 *
 * É o cabeçalho da tela de detalhe do painel que a DG Foods construiu —
 * Entrada, Tempo em Gestão, Promessa Comercial, Categoria, Meta 30 Dias,
 * Total 90 Dias — mais as três etapas do fluxo.
 */

export type EtapaFluxo = {
  concluida: boolean
  em: string | null
}

export type LojaNaCarteira = {
  unitId: string
  gestorNome: string | null
  entradaCarteira: string | null
  /** Dias desde a entrada. `null` sem data. */
  diasEmGestao: number | null
  promessaComercial: string | null
  categoria: "nova" | "ativa" | "pausada"
  metaTrintaDias: number | null
  checklist: EtapaFluxo
  cardapio: EtapaFluxo
  encaminhada: EtapaFluxo
  /** Faturamento dos últimos 90 dias e média dos 3 meses. */
  total90: number | null
  media3Meses: number | null
  /** Faturamento dos últimos 30 dias — comparado com a meta. */
  ultimos30: number | null
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const menos = (dias: number) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - dias)
  return iso(d)
}

export async function getLojaNaCarteira(
  unitId: string,
): Promise<LojaNaCarteira | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("units")
    .select(
      "id, entrada_carteira, promessa_comercial, categoria_carteira, meta_30_dias, checklist_ok_em, cardapio_ok_em, encaminhada_em, gestores(nome)",
    )
    .eq("id", unitId)
    .maybeSingle()
  if (!data) return null

  const u = data as unknown as {
    id: string
    entrada_carteira: string | null
    promessa_comercial: string | null
    categoria_carteira: LojaNaCarteira["categoria"]
    meta_30_dias: number | string | null
    checklist_ok_em: string | null
    cardapio_ok_em: string | null
    encaminhada_em: string | null
    gestores: { nome: string } | null
  }

  /* Uma chamada de 90 dias serve os três números: o total, a média mensal
     (total ÷ 3) e — junto de uma segunda de 30 — a comparação com a meta.
     Pedir 90 e 30 separados é mais barato que pedir mês a mês. */
  const [noventa, trinta] = await Promise.all([
    getRealMonthlyForUnitsForRange([unitId], { start: menos(90), end: iso(new Date()) }),
    getRealMonthlyForUnitsForRange([unitId], { start: menos(30), end: iso(new Date()) }),
  ])
  const m90 = noventa.get(unitId)
  const m30 = trinta.get(unitId)

  // Zero em tudo = sem dado importado, não "vendeu zero". Mesma régua da
  // aba Semana.
  const temDado = (m?: { faturamentoBruto: number; pedidos: number }) =>
    !!m && (m.faturamentoBruto > 0 || m.pedidos > 0)

  const etapa = (em: string | null): EtapaFluxo => ({
    concluida: em !== null,
    em,
  })

  return {
    unitId: u.id,
    gestorNome: u.gestores?.nome ?? null,
    entradaCarteira: u.entrada_carteira,
    diasEmGestao: u.entrada_carteira
      ? Math.floor(
          (Date.now() - new Date(`${u.entrada_carteira}T12:00:00Z`).getTime()) /
            86400000,
        )
      : null,
    promessaComercial: u.promessa_comercial,
    categoria: u.categoria_carteira ?? "nova",
    metaTrintaDias: u.meta_30_dias == null ? null : Number(u.meta_30_dias),
    checklist: etapa(u.checklist_ok_em),
    cardapio: etapa(u.cardapio_ok_em),
    encaminhada: etapa(u.encaminhada_em),
    total90: temDado(m90) ? m90!.faturamentoBruto : null,
    media3Meses: temDado(m90) ? m90!.faturamentoBruto / 3 : null,
    ultimos30: temDado(m30) ? m30!.faturamentoBruto : null,
  }
}
