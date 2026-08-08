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
import { isAppHomologation } from "./auth"
import { fetchAllReviews, getReview, type IfoodReview } from "./review"
import { idsDeUnidadesInativas } from "@/lib/data/unidades-inativas"

/** Tags de ELOGIO padrão do iFood (mesmas que o import gravava). Chave =
 *  minúsculo pra casar sem se importar com a caixa da API ("Comida Saborosa"
 *  vs "Comida saborosa"); valor = forma canônica que o painel exibe (bate com
 *  o histórico do import). Qualquer tag FORA dessa lista é reclamação. */
const ELOGIO_CANONICO = new Map<string, string>([
  ["comida saborosa", "Comida saborosa"],
  ["bem temperada", "Bem temperada"],
  ["boa quantidade", "Boa quantidade"],
  ["boa aparência", "Boa aparência"],
  ["boa embalagem", "Boa embalagem"],
  ["temperatura certa", "Temperatura certa"],
  ["bons ingredientes", "Bons ingredientes"],
  ["no ponto certo", "No ponto certo"],
  ["embalagem sustentável", "Embalagem sustentável"],
])

/** Extrai as tags do DETALHE (questions[CHOICE_MULTIPLE].answers) e separa em
 *  elogio (na lista padrão) x reclamação (o resto). */
function classificarTags(r: IfoodReview): {
  positivas: string[]
  negativas: string[]
} {
  const pos = new Set<string>()
  const neg = new Set<string>()
  for (const q of r.questions ?? []) {
    if (q.type !== "CHOICE_MULTIPLE") continue
    for (const a of q.answers ?? []) {
      const t = (a.title ?? "").trim()
      if (!t) continue
      const canon = ELOGIO_CANONICO.get(t.toLowerCase())
      if (canon) pos.add(canon)
      else neg.add(t)
    }
  }
  return { positivas: [...pos], negativas: [...neg] }
}

export type ReviewSyncUnitResult = {
  unitId: string
  unitCode: string
  unitName: string
  merchantId: string
  ok: boolean
  gravadas: number
  puladas: number
  /** HTTP status da 1ª chamada (pra distinguir 401 credencial de 403 loja). */
  status?: number
  motivo?: string
}

export type ReviewSyncResult = {
  lojasProcessadas: number
  totalGravadas: number
  /** App ainda em modo homologação (usa app de teste → real dá 403). Se true
   *  com todas as lojas falhando, o problema é IFOOD_REVIEW_HOMOLOGATION. */
  homologacao: boolean
  /** DIAGNÓSTICO: valor CRU da env var IFOOD_REVIEW_HOMOLOGATION que o servidor
   *  está lendo (com aspas via JSON, pra ver espaço/enter/ausência). Não é
   *  segredo — é só o flag true/false. Ajuda a achar var que não propagou. */
  flagRaw: string
  /** Credenciais do app de Avaliações presentes no ambiente? (sem revelar o
   *  valor — só se existem, pra separar "faltou env var" de "credencial errada"). */
  temCredenciais: boolean
  /** Client id do app de Avaliações em uso (identificador, não segredo). Prova
   *  qual app o deploy amarrou — o certo é o e5002ff2… (não o d730a9cc…). */
  appClientId: string
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
    data_avaliacao: dataAval,
    nota,
    comentario: r.comment ?? null,
    status_avaliacao: r.status ?? null,
    // NÃO enviamos tags_positivas/tags_negativas/status_pedido/servico_logistico
    // /import_id de propósito: a API de Review NÃO traz esses campos. Se a gente
    // mandasse (ex.: tags vazias), o upsert ZERAVA os dados ricos do import nas
    // avaliações que existem nas DUAS fontes. Omitindo, o upsert só atualiza os
    // campos que a API conhece (nota/comentário/status/datas) e PRESERVA o que o
    // import gravou (as tags de elogio/reclamação, status do pedido). Em row
    // nova, esses campos entram no default ('{}' / null).
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

  // Diagnóstico do ambiente (calculado 1x): o valor CRU do flag (com aspas via
  // JSON, pra ver espaço/enter/ausência) e se as credenciais existem.
  const flagRaw = JSON.stringify(process.env.IFOOD_REVIEW_SANDBOX ?? null)
  const temCredenciais = !!(
    process.env.IFOOD_REVIEW_CLIENT_ID?.trim() &&
    process.env.IFOOD_REVIEW_CLIENT_SECRET?.trim()
  )
  const homologacao = isAppHomologation("review")
  // Client id do app de Avaliações que o servidor ESTÁ usando (não é segredo —
  // é o identificador do app, e já aparece nos erros do iFood). Deixa provar
  // qual app o deploy amarrou, sem depender do eco do erro.
  const appClientId = process.env.IFOOD_REVIEW_CLIENT_ID?.trim() || "(ausente)"

  let q = admin
    .from("unit_platforms")
    .select("unit_id, api_store_id, units!inner(code, name)")
    .eq("platform", "ifood")
    .eq("active", true)
    .not("api_store_id", "is", null)
  if (unitIds !== null) {
    if (unitIds.length === 0)
      return {
        lojasProcessadas: 0,
        totalGravadas: 0,
        homologacao,
        flagRaw,
        temCredenciais,
        appClientId,
        resultados: [],
      }
    q = q.in("unit_id", unitIds)
  }
  const [{ data: vinculos, error }, inativas] = await Promise.all([
    q,
    idsDeUnidadesInativas(),
  ])
  if (error) throw new Error(`Falha ao listar lojas vinculadas: ${error.message}`)

  const resultados: ReviewSyncUnitResult[] = []
  for (const v of ((vinculos ?? []) as unknown as {
    unit_id: string
    api_store_id: string
    units: { code: string; name: string } | null
  }[])
    // Loja fechada não busca avaliação nova. O filtro acima é o da PLATAFORMA.
    .filter((v) => !inativas.has(v.unit_id))) {
    const merchantId = v.api_store_id
    const unitCode = v.units?.code ?? "?"
    const unitName = v.units?.name ?? "(loja)"
    const r = await fetchAllReviews(merchantId, { size: 50, maxPages: 40 })

    if (!r.ok) {
      // 403 = merchant não autorizou o app no portal (por loja).
      // 401 = credencial do app recusada (id/secret) — problema global.
      // 0   = token não obtido (faltam env vars).
      let motivo: string
      if (r.firstStatus === 403)
        motivo = "Loja não autorizada no portal do iFood (403) — autorize o app e sincronize de novo."
      else if (r.firstStatus === 401)
        motivo = "Credencial do app recusada (401) — confira o ID/secret na Vercel."
      else if (!r.firstStatus)
        motivo = r.error ?? "Falha ao autenticar (faltam credenciais na Vercel?)."
      else motivo = r.error ?? `HTTP ${r.firstStatus}`
      resultados.push({
        unitId: v.unit_id,
        unitCode,
        unitName,
        merchantId,
        ok: false,
        gravadas: 0,
        puladas: 0,
        status: r.firstStatus,
        motivo,
      })
      continue
    }

    const base = r.reviews
      .map((rev) => ({ rev, row: paraLinha(v.unit_id, rev) }))
      .filter((x): x is { rev: IfoodReview; row: NonNullable<typeof x.row> } =>
        x.row !== null,
      )
    const puladas = r.reviews.length - base.length

    // Quais avaliações JÁ têm tag no banco (import ou sync anterior) — não
    // precisam do detalhe de novo. Só busca detalhe das novas.
    const jaTag = new Set<string>()
    const pedidos = base.map((x) => x.row.pedido_id_longo)
    if (pedidos.length > 0) {
      const { data: ex } = await admin
        .from("ifood_avaliacoes")
        .select("pedido_id_longo, tags_positivas, tags_negativas")
        .eq("unit_id", v.unit_id)
        .in("pedido_id_longo", pedidos)
      for (const e of (ex ?? []) as {
        pedido_id_longo: string
        tags_positivas: string[] | null
        tags_negativas: string[] | null
      }[]) {
        if ((e.tags_positivas?.length ?? 0) > 0 || (e.tags_negativas?.length ?? 0) > 0)
          jaTag.add(e.pedido_id_longo)
      }
    }

    // Busca o DETALHE (pra pegar as tags) só das que ainda não têm — com teto
    // por sync pra não estourar tempo/rate limit numa loja com muito histórico.
    const MAX_DETALHES = 300
    let detalhes = 0
    const comTag: Array<
      NonNullable<ReturnType<typeof paraLinha>> & {
        tags_positivas: string[]
        tags_negativas: string[]
      }
    > = []
    const semTag: Array<NonNullable<ReturnType<typeof paraLinha>>> = []
    for (const { rev, row } of base) {
      if (!jaTag.has(row.pedido_id_longo) && rev.id && detalhes < MAX_DETALHES) {
        detalhes++
        const d = await getReview(merchantId, rev.id)
        if (d.ok && d.data) {
          const { positivas, negativas } = classificarTags(d.data)
          if (positivas.length > 0 || negativas.length > 0) {
            comTag.push({ ...row, tags_positivas: positivas, tags_negativas: negativas })
            continue
          }
        }
      }
      semTag.push(row)
    }

    // DOIS upserts: quem tem tag manda as colunas de tag; quem não tem OMITE
    // (senão o upsert zeraria a tag existente). Misturar num só faria o
    // Supabase incluir a coluna e null-ar quem não mandou.
    let erroUp: string | null = null
    for (const lote of [semTag, comTag]) {
      if (lote.length === 0) continue
      const { error: upErr } = await admin
        .from("ifood_avaliacoes")
        .upsert(lote, { onConflict: "unit_id,pedido_id_longo" })
      if (upErr) {
        erroUp = upErr.message
        break
      }
    }
    if (erroUp) {
      resultados.push({
        unitId: v.unit_id,
        unitCode,
        unitName,
        merchantId,
        ok: false,
        gravadas: 0,
        puladas,
        motivo: `Erro ao gravar: ${erroUp}`,
      })
      continue
    }

    // Log no Histórico de Importações (source='api' distingue da planilha) —
    // só quando a loja trouxe avaliação, pra não poluir com linhas de 0. Falha
    // aqui é só telemetria: não derruba o sync.
    if (base.length > 0) {
      const hoje = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date())
      const { error: logErr } = await admin.from("platform_imports").insert({
        unit_id: v.unit_id,
        platform: "ifood",
        report_type: "avaliacoes",
        cadencia: "diario",
        source: "api",
        source_filename: "API — avaliações (sync automático)",
        rows_imported: base.length,
        ref_date: hoje,
        status: "success",
      })
      if (logErr) console.error("review-sync log:", logErr.message)
    }

    resultados.push({
      unitId: v.unit_id,
      unitCode,
      unitName,
      merchantId,
      ok: true,
      gravadas: base.length,
      puladas,
    })
  }

  return {
    lojasProcessadas: resultados.length,
    totalGravadas: resultados.reduce((s, x) => s + x.gravadas, 0),
    homologacao,
    flagRaw,
    temCredenciais,
    appClientId,
    resultados,
  }
}
