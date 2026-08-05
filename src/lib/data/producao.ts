/**
 * Ficha técnica / de-para pra integração de demanda → produção (ERP).
 *
 * Converte o que as lojas VENDEM no delivery (itens, nomes diferentes por
 * plataforma) na DEMANDA DE INSUMOS do ERP (códigos CNP), explodindo cada
 * prato pela ficha técnica. Fonte das vendas:
 *   - iFood:  ifood_cardapio_periodo_items (period_end no mês)
 *   - 99 Food: ninefood_daily_item (data no mês)
 *   - Keeta:  keeta_daily_item (ref_year/ref_month)
 *
 * Cadastro (de-para + ficha) nas tabelas producao_* (migration 0038).
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { fetchAllRows } from "@/lib/data/paginate"
import { apenasJanelaVigente } from "@/lib/data/ifood-imported"
import { getUnits } from "@/lib/data/units"

export type Platform = "ifood" | "99food" | "keeta"

export type Insumo = {
  codigo: string
  nome: string
  unidade: string
  ativo: boolean
  /** Em quantas fichas este insumo é usado (0 = pode excluir direto). */
  emUso: number
}

export type FichaLinha = {
  insumoCodigo: string
  insumoNome: string
  unidade: string
  qtd: number
}

export type PratoNome = { id: string; platform: Platform; nomeItem: string }

export type Prato = {
  id: string
  nome: string
  ativo: boolean
  /** Nomes (por plataforma) que apontam pra este prato. */
  nomes: PratoNome[]
  /** Receita: insumos × quantidade por 1 prato vendido. */
  ficha: FichaLinha[]
}

export type ItemVendido = {
  platform: Platform
  nomeItem: string
  /** Total vendido no mês (somado nas lojas). */
  qtd: number
  pratoId: string | null
  pratoNome: string | null
  /** Ficha atual do item (insumos × qtd) — vazia se ainda sem ficha. */
  ficha: FichaLinha[]
}

export type DemandaInsumoLinha = {
  unitId: string
  unitCode: string
  unitName: string
  insumoCodigo: string
  insumoNome: string
  unidade: string
  qtd: number
}

export type DemandaNaoMapeado = {
  platform: Platform
  nomeItem: string
  qtd: number
}

export type DemandaInsumos = {
  linhas: DemandaInsumoLinha[]
  /** Itens vendidos sem prato/ficha — não entram na demanda, mas ficam à vista. */
  naoMapeados: DemandaNaoMapeado[]
}

type ItemSaleRow = {
  unitId: string
  platform: Platform
  nomeItem: string
  qtd: number
}

function monthBounds(year: number, month: number) {
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`
  const startIso = `${year}-${String(month).padStart(2, "0")}-01`
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const endExcl = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`
  return { start: fmt(startDate), end: fmt(endDate), startIso, endExcl }
}

const key = (platform: Platform, nomeItem: string) => `${platform}|${nomeItem}`

/** Vendas por item, mantendo a loja (pra demanda por loja). */
async function getItemSalesByUnit(
  year: number,
  month: number,
  filterUnitIds?: string[],
): Promise<ItemSaleRow[]> {
  const admin = createAdminClient()
  const { start, end, startIso, endExcl } = monthBounds(year, month)
  const out: ItemSaleRow[] = []

  const ifood = await fetchAllRows<{
    unit_id: string
    nome_item: string | null
    qtd_vendida: number | null
    period_end: string
    imported_at: string | null
  }>((from, to) => {
    let q = admin
      .from("ifood_cardapio_periodo_items")
      .select("unit_id, nome_item, qtd_vendida, period_end, imported_at")
      .gte("period_end", start)
      .lte("period_end", end)
      .order("id")
      .range(from, to)
    if (filterUnitIds) q = q.in("unit_id", filterUnitIds)
    return q
  }, "producao ifood items")
  // Uma exportação por loja: o relatório de Cardápio é snapshot de um período
  // escolhido na exportação, e janelas repetidas somariam a mesma venda —
  // aqui isso viraria demanda de produção inflada. Ver apenasJanelaVigente.
  for (const r of apenasJanelaVigente(ifood ?? [])) {
    if (!r.nome_item) continue
    out.push({
      unitId: r.unit_id,
      platform: "ifood",
      nomeItem: r.nome_item,
      qtd: r.qtd_vendida ?? 0,
    })
  }

  const nine = await fetchAllRows<{
    unit_id: string
    nome_item: string | null
    qtd_vendida: number | null
  }>((from, to) => {
    let q = admin
      .from("ninefood_daily_item")
      .select("unit_id, nome_item, qtd_vendida")
      .gte("data", startIso)
      .lt("data", endExcl)
      .order("id")
      .range(from, to)
    if (filterUnitIds) q = q.in("unit_id", filterUnitIds)
    return q
  }, "producao 99 items")
  for (const r of nine ?? []) {
    if (!r.nome_item) continue
    out.push({
      unitId: r.unit_id,
      platform: "99food",
      nomeItem: r.nome_item,
      qtd: r.qtd_vendida ?? 0,
    })
  }

  const keeta = await fetchAllRows<{
    unit_id: string
    nome_item: string | null
    qtd_vendida: number | string | null
  }>((from, to) => {
    let q = admin
      .from("keeta_daily_item")
      .select("unit_id, nome_item, qtd_vendida")
      .eq("ref_year", year)
      .eq("ref_month", month)
      .order("id")
      .range(from, to)
    if (filterUnitIds) q = q.in("unit_id", filterUnitIds)
    return q
  }, "producao keeta items")
  for (const r of keeta ?? []) {
    if (!r.nome_item) continue
    out.push({
      unitId: r.unit_id,
      platform: "keeta",
      nomeItem: r.nome_item,
      qtd: Number(r.qtd_vendida) || 0,
    })
  }

  return out
}

// ─── Cadastro (catálogo / pratos / de-para / ficha) ──────────────────

export async function getInsumos(): Promise<Insumo[]> {
  const admin = createAdminClient()
  const [rows, fichaRows] = await Promise.all([
    fetchAllRows<{
      codigo: string
      nome: string
      unidade: string
      ativo: boolean
    }>(
      (from, to) =>
        admin
          .from("producao_insumo")
          .select("codigo, nome, unidade, ativo")
          .order("codigo")
          .range(from, to),
      "producao_insumo",
    ),
    fetchAllRows<{ insumo_codigo: string }>(
      (from, to) =>
        admin
          .from("producao_ficha")
          .select("insumo_codigo")
          .order("id")
          .range(from, to),
      "producao_ficha (uso)",
    ),
  ])
  const uso = new Map<string, number>()
  for (const f of fichaRows ?? []) {
    uso.set(f.insumo_codigo, (uso.get(f.insumo_codigo) ?? 0) + 1)
  }
  return (rows ?? []).map((r) => ({
    codigo: r.codigo,
    nome: r.nome,
    unidade: r.unidade,
    ativo: r.ativo,
    emUso: uso.get(r.codigo) ?? 0,
  }))
}

/** Mapa de-para: "platform|nome_item" → { pratoId, pratoNome }. */
async function getDeParaMap(): Promise<
  Map<string, { pratoId: string; pratoNome: string }>
> {
  const admin = createAdminClient()
  const [nomes, pratos] = await Promise.all([
    fetchAllRows<{ platform: Platform; nome_item: string; prato_id: string }>(
      (from, to) =>
        admin
          .from("producao_prato_nome")
          .select("platform, nome_item, prato_id")
          .order("id")
          .range(from, to),
      "producao_prato_nome",
    ),
    fetchAllRows<{ id: string; nome: string }>(
      (from, to) =>
        admin
          .from("producao_prato")
          .select("id, nome")
          .order("id")
          .range(from, to),
      "producao_prato (map)",
    ),
  ])
  const pratoNome = new Map((pratos ?? []).map((p) => [p.id, p.nome]))
  const map = new Map<string, { pratoId: string; pratoNome: string }>()
  for (const n of nomes ?? []) {
    map.set(key(n.platform, n.nome_item), {
      pratoId: n.prato_id,
      pratoNome: pratoNome.get(n.prato_id) ?? "—",
    })
  }
  return map
}

/** prato_id → linhas da ficha (com nome/unidade do insumo resolvidos). */
async function getFichaByPrato(): Promise<Map<string, FichaLinha[]>> {
  const admin = createAdminClient()
  const [ficha, insumos] = await Promise.all([
    fetchAllRows<{ prato_id: string; insumo_codigo: string; qtd: number | string }>(
      (from, to) =>
        admin
          .from("producao_ficha")
          .select("prato_id, insumo_codigo, qtd")
          .order("id")
          .range(from, to),
      "producao_ficha (byPrato)",
    ),
    getInsumos(),
  ])
  const insumoById = new Map(insumos.map((i) => [i.codigo, i]))
  const map = new Map<string, FichaLinha[]>()
  for (const f of ficha ?? []) {
    const ins = insumoById.get(f.insumo_codigo)
    const arr = map.get(f.prato_id) ?? []
    arr.push({
      insumoCodigo: f.insumo_codigo,
      insumoNome: ins?.nome ?? f.insumo_codigo,
      unidade: ins?.unidade ?? "UN",
      qtd: Number(f.qtd) || 0,
    })
    map.set(f.prato_id, arr)
  }
  return map
}

export async function getPratosComFicha(): Promise<Prato[]> {
  const admin = createAdminClient()
  const [pratos, nomes, ficha, insumos] = await Promise.all([
    fetchAllRows<{ id: string; nome: string; ativo: boolean }>(
      (from, to) =>
        admin
          .from("producao_prato")
          .select("id, nome, ativo")
          .order("nome")
          .range(from, to),
      "producao_prato",
    ),
    fetchAllRows<{
      id: string
      prato_id: string
      platform: Platform
      nome_item: string
    }>(
      (from, to) =>
        admin
          .from("producao_prato_nome")
          .select("id, prato_id, platform, nome_item")
          .order("id")
          .range(from, to),
      "producao_prato_nome (full)",
    ),
    fetchAllRows<{
      prato_id: string
      insumo_codigo: string
      qtd: number | string
    }>(
      (from, to) =>
        admin
          .from("producao_ficha")
          .select("prato_id, insumo_codigo, qtd")
          .order("id")
          .range(from, to),
      "producao_ficha",
    ),
    getInsumos(),
  ])

  const insumoById = new Map(insumos.map((i) => [i.codigo, i]))
  const nomesByPrato = new Map<string, PratoNome[]>()
  for (const n of nomes ?? []) {
    const arr = nomesByPrato.get(n.prato_id) ?? []
    arr.push({ id: n.id, platform: n.platform, nomeItem: n.nome_item })
    nomesByPrato.set(n.prato_id, arr)
  }
  const fichaByPrato = new Map<string, FichaLinha[]>()
  for (const f of ficha ?? []) {
    const ins = insumoById.get(f.insumo_codigo)
    const arr = fichaByPrato.get(f.prato_id) ?? []
    arr.push({
      insumoCodigo: f.insumo_codigo,
      insumoNome: ins?.nome ?? f.insumo_codigo,
      unidade: ins?.unidade ?? "UN",
      qtd: Number(f.qtd) || 0,
    })
    fichaByPrato.set(f.prato_id, arr)
  }

  return (pratos ?? []).map((p) => ({
    id: p.id,
    nome: p.nome,
    ativo: p.ativo,
    nomes: nomesByPrato.get(p.id) ?? [],
    ficha: fichaByPrato.get(p.id) ?? [],
  }))
}

/**
 * Itens vendidos no mês (somados nas lojas), por plataforma + nome, já dizendo
 * se cada um está mapeado pra um prato. Ordenado por volume desc — os não
 * mapeados de maior volume aparecem primeiro pra priorizar o cadastro.
 */
export async function getItensVendidos(
  year: number,
  month: number,
): Promise<ItemVendido[]> {
  const [sales, dePara, fichaByPrato] = await Promise.all([
    getItemSalesByUnit(year, month),
    getDeParaMap(),
    getFichaByPrato(),
  ])
  const acc = new Map<string, ItemVendido>()
  for (const s of sales) {
    const k = key(s.platform, s.nomeItem)
    const cur = acc.get(k) ?? {
      platform: s.platform,
      nomeItem: s.nomeItem,
      qtd: 0,
      pratoId: null,
      pratoNome: null,
      ficha: [] as FichaLinha[],
    }
    cur.qtd += s.qtd
    const m = dePara.get(k)
    if (m) {
      cur.pratoId = m.pratoId
      cur.pratoNome = m.pratoNome
      cur.ficha = fichaByPrato.get(m.pratoId) ?? []
    }
    acc.set(k, cur)
  }
  return Array.from(acc.values()).sort((a, b) => b.qtd - a.qtd)
}

/**
 * Demanda de insumos por loja no mês: explode as vendas pela ficha técnica.
 * Itens sem de-para/ficha entram em `naoMapeados` (não somem da conta — só
 * sinalizam o que falta cadastrar).
 */
export async function getDemandaInsumos(
  year: number,
  month: number,
  filterUnitIds?: string[],
): Promise<DemandaInsumos> {
  const admin = createAdminClient()
  const [sales, dePara, fichaRows, insumos, units] = await Promise.all([
    getItemSalesByUnit(year, month, filterUnitIds),
    getDeParaMap(),
    fetchAllRows<{ prato_id: string; insumo_codigo: string; qtd: number | string }>(
      (from, to) =>
        admin
          .from("producao_ficha")
          .select("prato_id, insumo_codigo, qtd")
          .order("id")
          .range(from, to),
      "producao_ficha (demanda)",
    ),
    getInsumos(),
    getUnits(),
  ])

  const insumoById = new Map(insumos.map((i) => [i.codigo, i]))
  const unitById = new Map(units.map((u) => [u.id, u]))
  // prato_id → linhas da ficha
  const fichaByPrato = new Map<string, { insumo_codigo: string; qtd: number }[]>()
  for (const f of fichaRows ?? []) {
    const arr = fichaByPrato.get(f.prato_id) ?? []
    arr.push({ insumo_codigo: f.insumo_codigo, qtd: Number(f.qtd) || 0 })
    fichaByPrato.set(f.prato_id, arr)
  }

  // (unitId|insumo) → qtd
  const demanda = new Map<string, DemandaInsumoLinha>()
  const naoMap = new Map<string, DemandaNaoMapeado>()

  for (const s of sales) {
    const m = dePara.get(key(s.platform, s.nomeItem))
    const ficha = m ? fichaByPrato.get(m.pratoId) : undefined
    if (!m || !ficha || ficha.length === 0) {
      // Sem mapeamento OU sem ficha → não vira insumo.
      const nk = key(s.platform, s.nomeItem)
      const cur = naoMap.get(nk) ?? {
        platform: s.platform,
        nomeItem: s.nomeItem,
        qtd: 0,
      }
      cur.qtd += s.qtd
      naoMap.set(nk, cur)
      continue
    }
    const u = unitById.get(s.unitId)
    for (const f of ficha) {
      const dk = `${s.unitId}|${f.insumo_codigo}`
      const ins = insumoById.get(f.insumo_codigo)
      const cur = demanda.get(dk) ?? {
        unitId: s.unitId,
        unitCode: u?.code ?? "—",
        unitName: u?.name ?? "—",
        insumoCodigo: f.insumo_codigo,
        insumoNome: ins?.nome ?? f.insumo_codigo,
        unidade: ins?.unidade ?? "UN",
        qtd: 0,
      }
      cur.qtd += s.qtd * f.qtd
      demanda.set(dk, cur)
    }
  }

  return {
    linhas: Array.from(demanda.values()).sort(
      (a, b) =>
        a.unitCode.localeCompare(b.unitCode) ||
        a.insumoCodigo.localeCompare(b.insumoCodigo),
    ),
    naoMapeados: Array.from(naoMap.values()).sort((a, b) => b.qtd - a.qtd),
  }
}
