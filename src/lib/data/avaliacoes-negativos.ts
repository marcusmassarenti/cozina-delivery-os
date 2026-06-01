import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import type { PlatformId } from "@/components/platform-logo"

export type ComentarioNegativo = {
  unitId: string
  plataforma: PlatformId
  nota: number
  comentario: string
  data: string | null
}

/**
 * Comentários negativos (nota ≤ maxNota, com texto) do mês, nas 3 plataformas,
 * pras unidades pedidas. Ordenado do pior pro menos pior, depois mais recente.
 *
 *  - iFood:  ifood_avaliacoes (nota, comentario, data_avaliacao DATE)
 *  - 99 Food: ninefood_pedidos (nivel_avaliacao, conteudo_avaliacao, ts)
 *  - Keeta:  keeta_pedidos (pontuacao_avaliacao, conteudo_avaliacao, DATE)
 */
export async function getComentariosNegativos(
  year: number,
  month: number,
  filterUnitIds?: string[],
  maxNota = 2,
): Promise<ComentarioNegativo[]> {
  const admin = createAdminClient()
  const monthStr = String(month).padStart(2, "0")
  const startIso = `${year}-${monthStr}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const endExcl = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endIncl = `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`

  const out: ComentarioNegativo[] = []

  // iFood
  {
    let q = admin
      .from("ifood_avaliacoes")
      .select("unit_id, nota, comentario, data_avaliacao")
      .lte("nota", maxNota)
      .not("comentario", "is", null)
      .gte("data_avaliacao", startIso)
      .lte("data_avaliacao", endIncl)
      .limit(800)
    if (filterUnitIds) q = q.in("unit_id", filterUnitIds)
    const { data } = await q
    for (const r of data ?? []) {
      const c = String(r.comentario ?? "").trim()
      if (!c) continue
      out.push({
        unitId: r.unit_id as string,
        plataforma: "ifood",
        nota: Number(r.nota),
        comentario: c,
        data: (r.data_avaliacao as string | null) ?? null,
      })
    }
  }

  // 99 Food
  {
    let q = admin
      .from("ninefood_pedidos")
      .select("unit_id, nivel_avaliacao, conteudo_avaliacao, data_avaliacao")
      .lte("nivel_avaliacao", maxNota)
      .not("conteudo_avaliacao", "is", null)
      .gte("data_avaliacao", startIso)
      .lt("data_avaliacao", endExcl)
      .limit(800)
    if (filterUnitIds) q = q.in("unit_id", filterUnitIds)
    const { data } = await q
    for (const r of data ?? []) {
      const c = String(r.conteudo_avaliacao ?? "").trim()
      if (!c) continue
      out.push({
        unitId: r.unit_id as string,
        plataforma: "99food",
        nota: Number(r.nivel_avaliacao),
        comentario: c,
        data: (r.data_avaliacao as string | null) ?? null,
      })
    }
  }

  // Keeta
  {
    let q = admin
      .from("keeta_pedidos")
      .select("unit_id, pontuacao_avaliacao, conteudo_avaliacao, data_avaliacao")
      .lte("pontuacao_avaliacao", maxNota)
      .not("conteudo_avaliacao", "is", null)
      .gte("data_avaliacao", startIso)
      .lte("data_avaliacao", endIncl)
      .limit(800)
    if (filterUnitIds) q = q.in("unit_id", filterUnitIds)
    const { data } = await q
    for (const r of data ?? []) {
      const c = String(r.conteudo_avaliacao ?? "").trim()
      if (!c) continue
      out.push({
        unitId: r.unit_id as string,
        plataforma: "keeta",
        nota: Number(r.pontuacao_avaliacao),
        comentario: c,
        data: (r.data_avaliacao as string | null) ?? null,
      })
    }
  }

  out.sort(
    (a, b) =>
      a.nota - b.nota || (b.data ?? "").localeCompare(a.data ?? ""),
  )
  return out
}
