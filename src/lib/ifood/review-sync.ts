/**
 * Sync de PRODUÇÃO das avaliações do iFood (app "review", homologado 24/jul/26).
 *
 * Percorre as lojas com merchant iFood vinculado (unit_platforms.api_store_id) e
 * puxa as avaliações via API (fetchAllReviews), gravando em `ifood_avaliacoes` —
 * a MESMA tabela do import de planilha, na MESMA chave única (unit_id +
 * pedido_id_longo). Então a API deduplica sozinha com o que já foi importado e
 * vira a fonte da verdade dali pra frente.
 *
 * Loja sem autorização do app no portal volta 403/vazia — é PULADA com motivo,
 * nunca derruba o sync das outras.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { fetchAllReviews, type IfoodReview } from "./review"

export type ReviewSyncUnitResult = {
  unitId: string
  unitCode: string
  unitName: string
  merchantId: string
  ok: boolean
  gravadas: number
  puladas: number
  motivo?: string
}

export type ReviewSyncResult = {
  lojasProcessadas: number
  totalGravadas: number
  resultados: ReviewSyncUnitResult[]
}

/** Dia (YYYY-MM-DD) de uma data ISO; null se não der pra parsear. */
function diaDe(iso: string | undefined): string | null {
  if (!iso) return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso)
  return m ? m[1] : null
}

/** Mapeia uma avaliação da API pro formato da tabela `ifood_avaliacoes`.
 *  Devolve null quando falta o essencial (nota ou chave do pedido). */
function paraLinha(unitId: string, r: IfoodReview) {
  // Chave única = pedido do iFood. Preferimos o id longo do pedido; sem ele,
  // usamos o id da avaliação prefixado (não colide com pedido real).
  const pedidoLongo =
    r.order?.id ?? r.orderId ?? (r.id ? `review:${r.id}` : null)
  const dataAval = diaDe(r.createdAt) ?? diaDe(r.publishedAt)
  const nota = typeof r.score === "number" ? Math.round(r.score) : null
  if (!pedidoLongo || !dataAval || nota == null || nota < 1 || nota > 5) {
    return null
  }
  return {
    unit_id: unitId,
    pedido_id_curto: r.order?.shortId ?? null,
    pedido_id_longo: pedidoLongo,
    data_pedido: r.order?.createdAt ?? null,
    status_pedido: null,
    data_avaliacao: dataAval,
    nota,
    comentario: r.comment ?? null,
    status_avaliacao: r.status ?? null,
    // A API não traz as tags do relatório importado — ficam vazias (default).
    tags_positivas: [],
    tags_negativas: [],
    import_id: null,
  }
}

/**
 * Sincroniza as avaliações das lojas informadas (ou de todas as vinculadas
 * quando `unitIds` é null — usado pelo cron). Escopo/permissão é
 * responsabilidade de quem chama.
 */
export async function syncIfoodReviews(
  unitIds: string[] | null,
): Promise<ReviewSyncResult> {
  const admin = createAdminClient()

  let q = admin
    .from("unit_platforms")
    .select("unit_id, api_store_id, units!inner(code, name)")
    .eq("platform", "ifood")
    .eq("active", true)
    .not("api_store_id", "is", null)
  if (unitIds !== null) {
    if (unitIds.length === 0)
      return { lojasProcessadas: 0, totalGravadas: 0, resultados: [] }
    q = q.in("unit_id", unitIds)
  }
  const { data: vinculos, error } = await q
  if (error) throw new Error(`Falha ao listar lojas vinculadas: ${error.message}`)

  const resultados: ReviewSyncUnitResult[] = []
  for (const v of (vinculos ?? []) as unknown as {
    unit_id: string
    api_store_id: string
    units: { code: string; name: string } | null
  }[]) {
    const merchantId = v.api_store_id
    const unitCode = v.units?.code ?? "?"
    const unitName = v.units?.name ?? "(loja)"
    const r = await fetchAllReviews(merchantId, { size: 50, maxPages: 40 })

    if (!r.ok) {
      // 403 = app ainda não autorizado no portal pra essa loja. Não é erro
      // nosso — pula com o motivo pra tela mostrar "falta autorizar".
      const naoAutorizado = r.firstStatus === 403 || r.firstStatus === 401
      resultados.push({
        unitId: v.unit_id,
        unitCode,
        unitName,
        merchantId,
        ok: false,
        gravadas: 0,
        puladas: 0,
        motivo: naoAutorizado
          ? "App de Avaliações ainda não autorizado no portal pra esta loja."
          : r.error ?? `HTTP ${r.firstStatus ?? "?"}`,
      })
      continue
    }

    const linhas = r.reviews
      .map((rev) => paraLinha(v.unit_id, rev))
      .filter((l): l is NonNullable<typeof l> => l !== null)
    const puladas = r.reviews.length - linhas.length

    if (linhas.length > 0) {
      const { error: upErr } = await admin
        .from("ifood_avaliacoes")
        .upsert(linhas, { onConflict: "unit_id,pedido_id_longo" })
      if (upErr) {
        resultados.push({
          unitId: v.unit_id,
          unitCode,
          unitName,
          merchantId,
          ok: false,
          gravadas: 0,
          puladas,
          motivo: `Erro ao gravar: ${upErr.message}`,
        })
        continue
      }
    }

    resultados.push({
      unitId: v.unit_id,
      unitCode,
      unitName,
      merchantId,
      ok: true,
      gravadas: linhas.length,
      puladas,
    })
  }

  return {
    lojasProcessadas: resultados.length,
    totalGravadas: resultados.reduce((s, x) => s + x.gravadas, 0),
    resultados,
  }
}
