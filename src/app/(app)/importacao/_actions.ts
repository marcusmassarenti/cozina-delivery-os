"use server"

import { revalidatePath, revalidateTag } from "next/cache"

import * as XLSX from "xlsx"

import { requireModulePermission } from "@/lib/auth/guards"
import { createAdminClient } from "@/lib/supabase/admin"
import { parseIfoodReport } from "@/lib/import/ifood"
import type {
  ParsedAvaliacoes,
  ParsedCardapio,
  ParsedFinanceiro,
  ParsedPedidos,
} from "@/lib/import/ifood"
import {
  isNinefoodWorkbook,
  parseNinefoodReport,
} from "@/lib/import/ninefood"
import type {
  ParsedNinefoodDadosLoja,
  ParsedNinefoodDadosItem,
  ParsedNinefoodDadosPedido,
} from "@/lib/import/ninefood"
import { isKeetaWorkbook, parseKeetaReport } from "@/lib/import/keeta"
import { isProdutosVendidosWorkbook } from "@/lib/import/produtos-vendidos"
import type {
  ParsedKeetaLoja,
  ParsedKeetaItem,
  ParsedKeetaPedidos,
  ParsedKeetaPedidosRecentes,
} from "@/lib/import/keeta"

export type ImportFileResult = {
  filename: string
  /** Nome original do arquivo (sem o sufixo "· loja XXX" que adicionamos
   *  em multi-loja). Usado pelo client pra achar o File no state. */
  originalFilename?: string
  ok: boolean
  message?: string
  summary?: ImportSummary
  /** Quando a loja do arquivo não está vinculada a nenhuma unidade.
   *  O cliente abre modal "Criar e importar" pré-preenchido com isso. */
  unmapped?: {
    storeId: string
    platform: "ifood" | "99food" | "keeta"
    cnpj: string | null
    suggestedName: string | null
    suggestedCity: string | null
    reportTypeLabel: string
  }
}

export type ImportSummary =
  | {
      kind: "cardapio"
      unitCode: string
      unitName: string
      storeId: string
      date: string // YYYY-MM-DD
      pedidos: number
      conversao: number
      valorBrutoItens: number
      itensCount: number
      complementosCount: number
      substituido: boolean
    }
  | {
      kind: "financeiro"
      unitCode: string
      unitName: string
      storeId: string
      competencia: string
      pedidosUnicos: number
      bruto: number
      liquido: number
      cancelTotalQtd: number
      cancelParcialQtd: number
      lancamentos: number
      substituido: boolean
    }
  | {
      kind: "avaliacoes"
      unitCode: string
      unitName: string
      storeId: string
      periodoInicio: string // YYYY-MM-DD
      periodoFim: string // YYYY-MM-DD
      totalAvaliacoes: number
      notaMedia: number
      distribucao: Record<1 | 2 | 3 | 4 | 5, number>
      comComentario: number
      novas: number
      atualizadas: number
    }
  | {
      kind: "cardapio_periodo"
      unitCode: string
      unitName: string
      storeId: string
      periodoInicio: string // YYYY-MM-DD
      periodoFim: string // YYYY-MM-DD
      visitas: number
      concluidos: number
      conversao: number
      substituido: boolean
    }
  | {
      kind: "ninefood_loja"
      unitCode: string
      unitName: string
      storeId: string
      diasImportados: number
      periodoInicio: string // YYYY-MM-DD
      periodoFim: string // YYYY-MM-DD
      pedidos: number
      bruto: number
      liquido: number
      avaliacao: number | null
      substituido: boolean
    }
  | {
      kind: "ninefood_item"
      unitCode: string
      unitName: string
      storeId: string
      diasImportados: number
      itensCount: number
      periodoInicio: string // YYYY-MM-DD
      periodoFim: string // YYYY-MM-DD
      receitaTotal: number
      substituido: boolean
    }
  | {
      kind: "ninefood_pedido"
      unitCode: string
      unitName: string
      storeId: string
      periodoInicio: string // YYYY-MM-DD
      periodoFim: string // YYYY-MM-DD
      pedidos: number
      avaliados: number
      notaMedia: number | null
      novasAvaliacoes: number
      atualizadasAvaliacoes: number
      clientesNovos: number
      clientesRecorrentes: number
      substituido: boolean
    }
  | {
      kind: "keeta_loja"
      unitCode: string
      unitName: string
      storeId: string
      diasImportados: number
      periodoInicio: string // YYYY-MM-DD
      periodoFim: string // YYYY-MM-DD
      pedidos: number
      bruto: number
      cancelados: number
      substituido: boolean
    }
  | {
      kind: "keeta_item"
      unitCode: string
      unitName: string
      storeId: string
      diasImportados: number
      itensCount: number
      periodoInicio: string // YYYY-MM-DD
      periodoFim: string // YYYY-MM-DD
      receitaTotal: number
      substituido: boolean
    }
  | {
      kind: "keeta_pedido"
      unitCode: string
      unitName: string
      storeId: string
      periodoInicio: string // YYYY-MM-DD
      periodoFim: string // YYYY-MM-DD
      pedidos: number
      bruto: number
      liquido: number
      avaliados: number
      notaMedia: number | null
      substituido: boolean
    }
  | {
      kind: "keeta_pedido_recente"
      unitCode: string
      unitName: string
      storeId: string
      periodoInicio: string // YYYY-MM-DD
      periodoFim: string // YYYY-MM-DD
      pedidos: number
      concluidos: number
      cancelados: number
      promoKeeta: number
      promoLoja: number
      novos: number
      atualizados: number
    }
  | {
      kind: "ifood_pedidos"
      unitCode: string
      unitName: string
      storeId: string
      periodoInicio: string // YYYY-MM-DD
      periodoFim: string // YYYY-MM-DD
      pedidos: number
      pedidosVr: number
      valorVr: number
      novos: number
      atualizados: number
    }

export type ImportBatchState = {
  ok: boolean
  message?: string
  results?: ImportFileResult[]
}

const MAX_FILE_SIZE = 30 * 1024 * 1024 // 30 MB
const MAX_FILES_PER_BATCH = 30

/**
 * Importa N arquivos XLSX do iFood (Cardápio ou Financeiro).
 * Auto-detecta a unidade pelo storeId (Id da Loja / loja_id_curto) lendo
 * o external_store_id em unit_platforms. Processa cada arquivo de forma
 * independente — falhas individuais não invalidam os demais.
 *
 * Idempotente: re-importar a mesma data/competência substitui os dados.
 */
/**
 * Soma um contador em LOTES sobre `values`. O PostgREST monta o `.in()` como
 * query string na URL; com centenas de IDs longos a URL estoura (~15KB) e a
 * request falha ("fetch failed") depois de ~8s — o que travava a importação de
 * relatórios de pedido (centenas de linhas). Lotes de 150 mantêm a URL curta.
 */
async function somaEmLotes(
  values: string[],
  countSlice: (slice: string[]) => Promise<number>,
): Promise<number> {
  const CHUNK = 150
  let total = 0
  for (let i = 0; i < values.length; i += CHUNK) {
    total += await countSlice(values.slice(i, i + CHUNK))
  }
  return total
}

export async function importIfoodReports(
  _prevState: ImportBatchState,
  formData: FormData,
): Promise<ImportBatchState> {
  let userId: string
  try {
    ;({ userId } = await requireModulePermission("importacao", "edit"))
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Não autenticado" }
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length === 0) {
    return { ok: false, message: "Selecione pelo menos um arquivo XLSX." }
  }
  if (files.length > MAX_FILES_PER_BATCH) {
    return {
      ok: false,
      message: `Máximo ${MAX_FILES_PER_BATCH} arquivos por vez (você mandou ${files.length}).`,
    }
  }

  const admin = createAdminClient()

  // Carrega mapeamento storeId → unidade pra cada plataforma uma vez só
  const storeMaps = await loadAllStoreMaps(admin)

  // Processa todos em paralelo (mas limita IO no Postgres processando 1 por vez
  // se vier um Financeiro pesado junto). Avaliações pode retornar N results
  // (1 por loja no XLSX).
  const results: ImportFileResult[] = []
  for (const file of files) {
    const out = await processFile(file, storeMaps, admin, userId)
    if (Array.isArray(out)) results.push(...out)
    else results.push(out)
  }

  const anySuccess = results.some((r) => r.ok)
  if (anySuccess) {
    revalidateTag("reports", "max")
    revalidateTag("units", "max")
    revalidatePath("/importacao")
    revalidatePath("/")
  }

  return {
    ok: results.every((r) => r.ok),
    results,
  }
}

// ─── Mapeamento storeId → unidade ────────────────────────────────────

type StoreMap = Map<string, { unitId: string; code: string; name: string }>
type StoreMaps = { ifood: StoreMap; "99food": StoreMap; keeta: StoreMap }

async function loadStoreMap(
  admin: ReturnType<typeof createAdminClient>,
  platform: "ifood" | "99food" | "keeta" = "ifood",
): Promise<StoreMap> {
  const map: StoreMap = new Map()
  const { data, error } = await admin
    .from("unit_platforms")
    .select("unit_id, external_store_id, units:units!inner(id, code, name)")
    .eq("platform", platform)
    .not("external_store_id", "is", null)
  if (error) return map
  for (const row of data ?? []) {
    if (!row.external_store_id) continue
    const u = row.units as unknown as
      | { id: string; code: string; name: string }
      | { id: string; code: string; name: string }[]
    const unit = Array.isArray(u) ? u[0] : u
    if (!unit) continue
    map.set(String(row.external_store_id), {
      unitId: unit.id,
      code: unit.code,
      name: unit.name,
    })
  }
  return map
}

async function loadAllStoreMaps(
  admin: ReturnType<typeof createAdminClient>,
): Promise<StoreMaps> {
  const [ifood, ninefood, keeta] = await Promise.all([
    loadStoreMap(admin, "ifood"),
    loadStoreMap(admin, "99food"),
    loadStoreMap(admin, "keeta"),
  ])
  return { ifood, "99food": ninefood, keeta }
}

// ─── Processa 1 arquivo ──────────────────────────────────────────────

async function processFile(
  file: File,
  storeMaps: StoreMaps,
  admin: ReturnType<typeof createAdminClient>,
  userId: string | null,
): Promise<ImportFileResult | ImportFileResult[]> {
  if (file.size > MAX_FILE_SIZE) {
    return {
      filename: file.name,
      ok: false,
      message: `Arquivo muito grande (limite 30MB).`,
    }
  }

  let buf: ArrayBuffer
  try {
    buf = await file.arrayBuffer()
  } catch (e) {
    return {
      filename: file.name,
      ok: false,
      message: e instanceof Error ? e.message : "Erro ao ler arquivo",
    }
  }

  // ─── ROTEAMENTO POR PLATAFORMA ─────────────────────────────────────
  // Cada plataforma tem header distinto:
  //  - Keeta: "ID do restaurante" + "Nome da loja"
  //  - 99 Food: "Nome do estabelecimento" + "ID do loja"
  //  - iFood: fallback
  let platform: "ifood" | "99food" | "keeta" = "ifood"
  try {
    const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: false })
    // "Produtos vendidos" do JK não é importação de plataforma — é dentro do
    // Fechamento da unidade. Se cair aqui por engano, avisa onde importar.
    if (isProdutosVendidosWorkbook(wb)) {
      return {
        filename: file.name,
        ok: false,
        message:
          'Essa é a planilha "Produtos vendidos" do JK — importe ela dentro do Fechamento da unidade (aba Fechamento), não aqui.',
      }
    }
    if (isKeetaWorkbook(wb)) platform = "keeta"
    else if (isNinefoodWorkbook(wb)) platform = "99food"
  } catch {
    // Ignora erro aqui — os parsers darão uma mensagem melhor.
  }

  // ─── KEETA ──────────────────────────────────────────────────────────
  if (platform === "keeta") {
    const parsed = parseKeetaReport(buf)
    if (parsed.reportType === "unknown") {
      return {
        filename: file.name,
        ok: false,
        message: `Keeta: ${parsed.error}`,
      }
    }
    if (parsed.reportType === "loja") {
      return await processKeetaLoja(
        parsed,
        storeMaps.keeta,
        file.name,
        userId,
        admin,
      )
    }
    if (parsed.reportType === "item") {
      return await processKeetaItens(
        parsed,
        storeMaps.keeta,
        file.name,
        userId,
        admin,
      )
    }
    if (parsed.reportType === "pedido") {
      return await processKeetaPedidos(
        parsed,
        storeMaps.keeta,
        file.name,
        userId,
        admin,
      )
    }
    if (parsed.reportType === "pedido_recente") {
      return await processKeetaPedidosRecentes(
        parsed,
        storeMaps.keeta,
        file.name,
        userId,
        admin,
      )
    }
  }

  // ─── 99 FOOD ────────────────────────────────────────────────────────
  if (platform === "99food") {
    const parsed = parseNinefoodReport(buf)
    if (parsed.reportType === "unknown") {
      return {
        filename: file.name,
        ok: false,
        message: `99 Food: ${parsed.error}`,
      }
    }
    if (parsed.reportType === "dados_loja") {
      return await processNinefoodDadosLoja(
        parsed,
        storeMaps["99food"],
        file.name,
        userId,
        admin,
      )
    }
    if (parsed.reportType === "dados_item") {
      return await processNinefoodDadosItem(
        parsed,
        storeMaps["99food"],
        file.name,
        userId,
        admin,
      )
    }
    if (parsed.reportType === "dados_pedido") {
      return await processNinefoodDadosPedido(
        parsed,
        storeMaps["99food"],
        file.name,
        userId,
        admin,
      )
    }
  }

  // ─── IFOOD ──────────────────────────────────────────────────────────
  const storeMap = storeMaps.ifood
  let parsed
  try {
    parsed = parseIfoodReport(buf)
  } catch (e) {
    return {
      filename: file.name,
      ok: false,
      message: e instanceof Error ? e.message : "Erro ao ler XLSX",
    }
  }

  if (parsed.reportType === "unknown") {
    return {
      filename: file.name,
      ok: false,
      message: `Não reconheci como Cardápio, Financeiro ou Avaliações do iFood (nem como relatório do 99 Food). ${parsed.error}`,
    }
  }

  // Relatório de Vendas (resumo) — não traz dado novo, já vem pela
  // Conciliação. Aceita silenciosamente pra não confundir o operador.
  // Listamos as lojas detectadas pra ele conferir cobertura.
  if (parsed.reportType === "vendas") {
    const periodo = parsed.period ? ` (${parsed.period})` : ""
    const lojasLinhas = parsed.stores
      .map((s) => {
        const nome = s.storeName.replace(/^Churrasco no Pote\s*-?\s*/i, "") ||
          s.storeName
        const valor = s.valor.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
          maximumFractionDigits: 0,
        })
        return `${nome} (${s.pedidos} ped · ${valor})`
      })
      .join(", ")
    const lojasResumo =
      parsed.stores.length === 0
        ? ""
        : ` · ${parsed.stores.length} loja(s) no arquivo${periodo}: ${lojasLinhas}`
    return {
      filename: file.name,
      ok: true,
      message:
        `Relatório de Vendas do iFood — não precisa importar (esses dados já vêm pelo "Relatório de Conciliação" / Financeiro).${lojasResumo}`,
    }
  }

  // Avaliações é multi-loja — não tem storeId top-level. Trata separado.
  if (parsed.reportType === "avaliacoes") {
    return await processAvaliacoesMultiloja(
      parsed,
      storeMap,
      file.name,
      userId,
      admin,
    )
  }

  // Pedidos (forma de pagamento / VR) — agrupado por loja.
  if (parsed.reportType === "pedidos") {
    return await processPedidosMultiloja(
      parsed,
      storeMap,
      file.name,
      userId,
      admin,
    )
  }

  // Cardápio NÃO diário (período) → multi-loja agregado
  if (parsed.reportType === "cardapio" && !parsed.isDaily) {
    return await processCardapioPeriodoMultiloja(
      parsed,
      storeMap,
      file.name,
      userId,
      admin,
    )
  }

  // Cardapio diário e Financeiro: 1 loja por arquivo
  const storeId = parsed.storeId
  const unit = storeMap.get(storeId)
  if (!unit) {
    // Loja não vinculada — retorna sugestões pro cliente abrir o modal
    const fromFilename = extractFromFilename(file.name)
    const fromArquivo = extractFromParsed(parsed)
    return {
      filename: file.name,
      ok: false,
      unmapped: {
        storeId,
        platform: "ifood",
        cnpj: fromArquivo.cnpj ?? null,
        suggestedName: fromArquivo.storeName ?? fromFilename.name ?? null,
        suggestedCity: fromFilename.city ?? null,
        reportTypeLabel:
          parsed.reportType === "cardapio" ? "Cardápio iFood" : "Financeiro iFood",
      },
    }
  }

  try {
    if (parsed.reportType === "cardapio") {
      const summary = await saveCardapio(parsed, unit, file.name, userId, admin)
      return { filename: file.name, ok: true, summary }
    }
    if (parsed.reportType === "financeiro") {
      const summary = await saveFinanceiro(parsed, unit, file.name, userId, admin)
      return { filename: file.name, ok: true, summary }
    }
    return {
      filename: file.name,
      ok: false,
      message: "Tipo de relatório não suportado ainda.",
    }
  } catch (e) {
    console.error(`processFile(${file.name}) error:`, e)
    return {
      filename: file.name,
      ok: false,
      message: e instanceof Error ? e.message : "Erro ao gravar a importação.",
    }
  }
}

/**
 * Avaliações vem com várias lojas no mesmo arquivo. Pra cada loja:
 *  - Se mapeada → grava e retorna result ok
 *  - Se não mapeada → retorna result unmapped (botão "Criar e importar")
 *
 * Como uma função só retorna 1 result, e queremos N (1 por loja),
 * adaptamos isso: retornamos um result "agregado" do tipo "avaliacoes"
 * só pras lojas que estavam mapeadas, e adicionamos UMA entrada
 * extra por loja não mapeada via mecanismo especial:
 *   o caller (importIfoodReports) flatten-a o array.
 */
async function processAvaliacoesMultiloja(
  parsed: ParsedAvaliacoes,
  storeMap: StoreMap,
  filename: string,
  userId: string | null,
  admin: ReturnType<typeof createAdminClient>,
): Promise<ImportFileResult | ImportFileResult[]> {
  const results: ImportFileResult[] = []
  for (const grupo of parsed.porLoja) {
    const unit = storeMap.get(grupo.storeId)
    if (!unit) {
      results.push({
        filename: `${filename} · loja ${grupo.storeName ?? grupo.storeId}`,
        originalFilename: filename,
        ok: false,
        unmapped: {
          storeId: grupo.storeId,
          platform: "ifood",
          cnpj: null,
          suggestedName: grupo.storeName
            ? formatStoreName(grupo.storeName)
            : null,
          suggestedCity: extractCityFromStoreName(grupo.storeName),
          reportTypeLabel: "Avaliações iFood",
        },
      })
      continue
    }
    try {
      const summary = await saveAvaliacoesPorLoja(
        grupo,
        unit,
        filename,
        userId,
        admin,
      )
      results.push({
        filename: `${filename} · ${unit.code} ${unit.name}`,
        originalFilename: filename,
        ok: true,
        summary,
      })
    } catch (e) {
      results.push({
        filename: `${filename} · ${unit.code} ${unit.name}`,
        originalFilename: filename,
        ok: false,
        message:
          e instanceof Error
            ? e.message
            : `Erro ao gravar avaliações da loja ${grupo.storeId}`,
      })
    }
  }
  return results
}

/**
 * Relatório de pedidos do iFood (forma de pagamento / VR), agrupado por loja.
 * Cada loja vira um result. Lojas não mapeadas viram unmapped.
 */
async function processPedidosMultiloja(
  parsed: ParsedPedidos,
  storeMap: StoreMap,
  filename: string,
  userId: string | null,
  admin: ReturnType<typeof createAdminClient>,
): Promise<ImportFileResult[]> {
  const results: ImportFileResult[] = []
  for (const grupo of parsed.porLoja) {
    const unit = storeMap.get(grupo.storeId)
    if (!unit) {
      results.push({
        filename: `${filename} · loja ${grupo.storeName ?? grupo.storeId}`,
        originalFilename: filename,
        ok: false,
        unmapped: {
          storeId: grupo.storeId,
          platform: "ifood",
          cnpj: null,
          suggestedName: grupo.storeName
            ? formatStoreName(grupo.storeName)
            : null,
          suggestedCity: extractCityFromStoreName(grupo.storeName),
          reportTypeLabel: "Pedidos iFood",
        },
      })
      continue
    }
    try {
      const summary = await savePedidosPorLoja(
        grupo,
        unit,
        filename,
        userId,
        admin,
      )
      results.push({
        filename: `${filename} · ${unit.code} ${unit.name}`,
        originalFilename: filename,
        ok: true,
        summary,
      })
    } catch (e) {
      results.push({
        filename: `${filename} · ${unit.code} ${unit.name}`,
        originalFilename: filename,
        ok: false,
        message:
          e instanceof Error
            ? e.message
            : `Erro ao gravar pedidos da loja ${grupo.storeId}`,
      })
    }
  }
  return results
}

async function savePedidosPorLoja(
  grupo: ParsedPedidos["porLoja"][number],
  unit: { unitId: string; code: string; name: string },
  filename: string,
  userId: string | null,
  admin: ReturnType<typeof createAdminClient>,
): Promise<ImportSummary> {
  // Só pedidos com data (a coluna data é NOT NULL) e SEM data no futuro
  // (erro de parse) — não existe venda futura; +1 dia de folga de fuso.
  const limiteFuturo = Date.now() + 86_400_000
  const pedidos = grupo.pedidos.filter(
    (p) => p.horario && (p.horario as Date).getTime() <= limiteFuturo,
  )
  if (pedidos.length === 0) {
    throw new Error("Nenhum pedido com data válida no relatório.")
  }
  const datas = pedidos.map((p) => p.horario as Date)
  const minData = new Date(Math.min(...datas.map((d) => d.getTime())))
  const maxData = new Date(Math.max(...datas.map((d) => d.getTime())))
  const periodoInicio = formatDateOnly(minData)
  const periodoFim = formatDateOnly(maxData)

  // Quantos já existem no período (pra estimar novos vs atualizados)
  const { count: existentes } = await admin
    .from("ifood_pedidos")
    .select("*", { count: "exact", head: true })
    .eq("unit_id", unit.unitId)
    .gte("data", periodoInicio)
    .lte("data", periodoFim)

  // Log de importação (ref = mês da última data)
  const { data: importLog, error: ilErr } = await admin
    .from("platform_imports")
    .insert({
      unit_id: unit.unitId,
      platform: "ifood",
      report_type: "pedidos",
      cadencia: "mensal",
      ref_year: maxData.getFullYear(),
      ref_month: maxData.getMonth() + 1,
      source_filename: filename,
      imported_by: userId,
      status: "success",
      rows_imported: pedidos.length,
    })
    .select("id")
    .single()
  if (ilErr) throw new Error(`Falha ao criar log: ${ilErr.message}`)

  const rows = pedidos.map((p) => {
    const d = p.horario as Date
    return {
      unit_id: unit.unitId,
      pedido_id: p.pedidoId,
      pedido_id_curto: p.pedidoIdCurto,
      data: formatDateOnly(d),
      horario: d.toISOString(),
      ref_year: d.getFullYear(),
      ref_month: d.getMonth() + 1,
      turno: p.turno,
      status_final: p.statusFinal,
      valor_itens: p.valorItens,
      total_pago_cliente: p.totalPagoCliente,
      taxa_entrega_cliente: p.taxaEntregaCliente,
      incentivo_ifood: p.incentivoIfood,
      incentivo_loja: p.incentivoLoja,
      incentivo_rede: p.incentivoRede,
      taxa_servico: p.taxaServico,
      taxas_comissoes: p.taxasComissoes,
      valor_liquido: p.valorLiquido,
      forma_pagamento: p.formaPagamento,
      forma_grupo: p.formaGrupo,
      bandeira_vr: p.bandeiraVr,
      tipo_entrega: p.tipoEntrega,
      produto_logistico: p.produtoLogistico,
      canal_venda: p.canalVenda,
      import_id: importLog.id,
    }
  })

  // Upsert em lotes (idempotente por unit_id + pedido_id)
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin
      .from("ifood_pedidos")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "unit_id,pedido_id" })
    if (error) throw new Error(`Falha ao gravar pedidos: ${error.message}`)
  }

  const pedidosVr = pedidos.filter((p) => p.bandeiraVr).length
  const valorVr = pedidos
    .filter((p) => p.bandeiraVr)
    .reduce((s, p) => s + (p.totalPagoCliente ?? 0), 0)
  const existentesNum = existentes ?? 0
  const novos = Math.max(0, pedidos.length - existentesNum)
  const atualizados = Math.min(existentesNum, pedidos.length)

  return {
    kind: "ifood_pedidos",
    unitCode: unit.code,
    unitName: unit.name,
    storeId: grupo.storeId,
    periodoInicio,
    periodoFim,
    pedidos: pedidos.length,
    pedidosVr,
    valorVr: Math.round(valorVr * 100) / 100,
    novos,
    atualizados,
  }
}

/**
 * Cardápio de PERÍODO (não-diário): traz funil agregado de N lojas.
 * Cada loja vira um result. Lojas não mapeadas viram unmapped.
 */
async function processCardapioPeriodoMultiloja(
  parsed: ParsedCardapio,
  storeMap: StoreMap,
  filename: string,
  userId: string | null,
  admin: ReturnType<typeof createAdminClient>,
): Promise<ImportFileResult[]> {
  const results: ImportFileResult[] = []
  const periodStart = formatDateOnly(parsed.period.start)
  const periodEnd = formatDateOnly(parsed.period.end)
  // Itens e complementos só são salvos quando o XLSX é de 1 loja só.
  // Em XLSX multi-loja eles são da rede agregada (não dá pra atribuir a unit_id).
  const isSingleStore = parsed.porLoja.length === 1

  for (const grupo of parsed.porLoja) {
    const unit = storeMap.get(grupo.storeId)
    if (!unit) {
      results.push({
        filename: `${filename} · loja ${grupo.storeName ?? grupo.storeId}`,
        originalFilename: filename,
        ok: false,
        unmapped: {
          storeId: grupo.storeId,
          platform: "ifood",
          cnpj: null,
          suggestedName: grupo.storeName
            ? formatStoreName(grupo.storeName)
            : null,
          suggestedCity: extractCityFromStoreName(grupo.storeName),
          reportTypeLabel: "Cardápio iFood (período)",
        },
      })
      continue
    }
    try {
      const { substituido, importId } = await saveCardapioPeriodo(
        grupo,
        unit,
        parsed.period,
        filename,
        userId,
        admin,
      )
      // Quando é 1 loja só, grava items e complementos do período também
      if (isSingleStore) {
        await saveCardapioPeriodoItens(
          parsed,
          unit,
          parsed.period,
          importId,
          admin,
        )
      }
      const conversao = grupo.funnel.conversaoPct ?? 0
      results.push({
        filename: `${filename} · ${unit.code} ${unit.name}`,
        originalFilename: filename,
        ok: true,
        summary: {
          kind: "cardapio_periodo",
          unitCode: unit.code,
          unitName: unit.name,
          storeId: grupo.storeId,
          periodoInicio: periodStart,
          periodoFim: periodEnd,
          visitas: grupo.funnel.visitas,
          concluidos: grupo.funnel.concluidos,
          conversao,
          substituido,
        },
      })
    } catch (e) {
      results.push({
        filename: `${filename} · ${unit.code} ${unit.name}`,
        originalFilename: filename,
        ok: false,
        message:
          e instanceof Error
            ? e.message
            : `Erro ao gravar Cardápio (período) da loja ${grupo.storeId}`,
      })
    }
  }
  return results
}

async function saveCardapioPeriodo(
  grupo: ParsedCardapio["porLoja"][number],
  unit: { unitId: string; code: string; name: string },
  period: ParsedCardapio["period"],
  filename: string,
  userId: string | null,
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ substituido: boolean; importId: string }> {
  const periodStart = formatDateOnly(period.start)
  const periodEnd = formatDateOnly(period.end)

  // Verifica se já existe
  const { data: existing } = await admin
    .from("ifood_cardapio_periodo")
    .select("id")
    .eq("unit_id", unit.unitId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .maybeSingle()
  const substituido = !!existing

  // Log de importação
  const { data: importLog, error: ilErr } = await admin
    .from("platform_imports")
    .insert({
      unit_id: unit.unitId,
      platform: "ifood",
      report_type: "cardapio",
      cadencia: "mensal",
      ref_date: periodEnd,
      source_filename: filename,
      imported_by: userId,
      status: "success",
      rows_imported: 1,
    })
    .select("id")
    .single()
  if (ilErr) throw new Error(`Falha ao criar log: ${ilErr.message}`)

  const payload = {
    unit_id: unit.unitId,
    period_start: periodStart,
    period_end: periodEnd,
    period_label: period.raw,
    visitas: grupo.funnel.visitas,
    visualizacoes: grupo.funnel.visualizacoes,
    sacola: grupo.funnel.sacola,
    revisao: grupo.funnel.revisao,
    concluidos: grupo.funnel.concluidos,
    conversao_pct: grupo.funnel.conversaoPct,
    visitas_anterior: grupo.funnel.visitasAnterior,
    visualizacoes_anterior: grupo.funnel.visualizacoesAnterior,
    sacola_anterior: grupo.funnel.sacolaAnterior,
    revisao_anterior: grupo.funnel.revisaoAnterior,
    concluidos_anterior: grupo.funnel.concluidosAnterior,
    conversao_pct_anterior: grupo.funnel.conversaoPctAnterior,
    import_id: importLog.id,
  }

  const { error } = await admin
    .from("ifood_cardapio_periodo")
    .upsert(payload, { onConflict: "unit_id,period_start,period_end" })
  if (error) throw new Error(`Falha ao gravar snapshot: ${error.message}`)

  return { substituido, importId: importLog.id }
}

/**
 * Grava items + complementos do Cardápio de período quando o XLSX tem
 * apenas 1 loja (multi-loja não dá pra atribuir a unit_id).
 * Idempotente: apaga linhas anteriores do mesmo (unit, period) antes.
 */
async function saveCardapioPeriodoItens(
  parsed: ParsedCardapio,
  unit: { unitId: string; code: string; name: string },
  period: ParsedCardapio["period"],
  importId: string,
  admin: ReturnType<typeof createAdminClient>,
): Promise<void> {
  const periodStart = formatDateOnly(period.start)
  const periodEnd = formatDateOnly(period.end)

  // Apaga existentes (substituição)
  await admin
    .from("ifood_cardapio_periodo_items")
    .delete()
    .eq("unit_id", unit.unitId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
  await admin
    .from("ifood_cardapio_periodo_complementos")
    .delete()
    .eq("unit_id", unit.unitId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)

  if (parsed.items.length > 0) {
    const { error: iErr } = await admin
      .from("ifood_cardapio_periodo_items")
      .insert(
        parsed.items.map((item) => ({
          unit_id: unit.unitId,
          period_start: periodStart,
          period_end: periodEnd,
          categoria: item.categoria,
          nome_item: item.nomeItem,
          visitas: item.visitas,
          pedidos: item.pedidos,
          conversao_pct: item.conversaoPct,
          qtd_vendida: item.qtdVendida,
          qtd_com_promocao: item.qtdComPromocao,
          pedidos_com_promocao: item.pedidosComPromocao,
          valor_total: item.valorTotal,
          import_id: importId,
        })),
      )
    if (iErr) throw new Error(`Falha ao gravar itens do período: ${iErr.message}`)
  }

  if (parsed.complementos.length > 0) {
    const { error: cErr } = await admin
      .from("ifood_cardapio_periodo_complementos")
      .insert(
        parsed.complementos.map((c) => ({
          unit_id: unit.unitId,
          period_start: periodStart,
          period_end: periodEnd,
          classificacao: c.classificacao,
          nome_complemento: c.nomeComplemento,
          lojas: c.lojas,
          pedidos: c.pedidos,
          qtd_vendida: c.qtdVendida,
          valor_total: c.valorTotal,
          import_id: importId,
        })),
      )
    if (cErr)
      throw new Error(`Falha ao gravar complementos do período: ${cErr.message}`)
  }
}

function formatStoreName(raw: string): string {
  // "CHURRASCO NO POTE - JARDINS" → "Churrasco no Pote — Jardins"
  return raw
    .split(" - ")
    .map((p) =>
      p
        .toLowerCase()
        .split(" ")
        .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
        .join(" "),
    )
    .join(" — ")
}

function extractCityFromStoreName(name: string | null): string | null {
  if (!name) return null
  const parts = name.split(" - ")
  if (parts.length < 2) return null
  // Última parte é tipicamente a cidade/bairro
  const last = parts[parts.length - 1].trim()
  return last
    .toLowerCase()
    .split(" ")
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
}

// ─── 99 Food: Dados da loja ──────────────────────────────────────────

/**
 * "Dados da loja" do 99 Food = financeiro agregado por dia.
 * 1 XLSX pode trazer N lojas × N dias. Agrupamos por storeId,
 * geramos 1 result por loja (igual ao padrão de Avaliações iFood).
 */
async function processNinefoodDadosLoja(
  parsed: ParsedNinefoodDadosLoja,
  storeMap: StoreMap,
  filename: string,
  userId: string | null,
  admin: ReturnType<typeof createAdminClient>,
): Promise<ImportFileResult[]> {
  // Arquivo válido mas sem dados (loja sem operação no período) — devolve
  // um result de sucesso com mensagem amigável em vez de "erro vazio".
  if (parsed.porLoja.length === 0) {
    return [
      {
        filename,
        ok: true,
        message:
          "99 Food — Dados da loja: sem vendas no período (arquivo ok, mas vazio).",
      },
    ]
  }
  const results: ImportFileResult[] = []
  const isMulti = parsed.porLoja.length > 1

  for (const grupo of parsed.porLoja) {
    const unit = storeMap.get(grupo.storeId)
    if (!unit) {
      results.push({
        filename: isMulti
          ? `${filename} · loja ${grupo.storeName ?? grupo.storeId}`
          : filename,
        originalFilename: isMulti ? filename : undefined,
        ok: false,
        unmapped: {
          storeId: grupo.storeId,
          platform: "99food",
          cnpj: null,
          suggestedName: grupo.storeName
            ? formatStoreName(grupo.storeName)
            : null,
          suggestedCity: extractCityFromStoreName(grupo.storeName),
          reportTypeLabel: "99 Food — Dados da loja",
        },
      })
      continue
    }
    try {
      const summary = await saveNinefoodDadosLoja(
        grupo,
        unit,
        filename,
        userId,
        admin,
      )
      results.push({
        filename: isMulti
          ? `${filename} · ${unit.code} ${unit.name}`
          : filename,
        originalFilename: isMulti ? filename : undefined,
        ok: true,
        summary,
      })
    } catch (e) {
      results.push({
        filename: isMulti
          ? `${filename} · ${unit.code} ${unit.name}`
          : filename,
        originalFilename: isMulti ? filename : undefined,
        ok: false,
        message:
          e instanceof Error
            ? e.message
            : `Erro ao gravar Dados da loja 99 Food (${grupo.storeId})`,
      })
    }
  }
  return results
}

async function saveNinefoodDadosLoja(
  grupo: ParsedNinefoodDadosLoja["porLoja"][number],
  unit: { unitId: string; code: string; name: string },
  filename: string,
  userId: string | null,
  admin: ReturnType<typeof createAdminClient>,
): Promise<ImportSummary> {
  if (grupo.dias.length === 0) {
    throw new Error("Nenhum dia válido nessa loja.")
  }

  // Período coberto
  const sortedTs = grupo.dias
    .map((d) => d.data.getTime())
    .sort((a, b) => a - b)
  const periodoInicio = new Date(sortedTs[0])
  const periodoFim = new Date(sortedTs[sortedTs.length - 1])
  const isoDatas = grupo.dias.map((d) => formatDateOnly(d.data))

  // Substituição idempotente: apaga linhas dos mesmos dias antes de inserir
  const { count: existingCount } = await admin
    .from("ninefood_daily_loja")
    .select("id", { count: "exact", head: true })
    .eq("unit_id", unit.unitId)
    .in("data", isoDatas)
  const substituido = (existingCount ?? 0) > 0

  // Log de importação
  const { data: importLog, error: ilErr } = await admin
    .from("platform_imports")
    .insert({
      unit_id: unit.unitId,
      platform: "99food",
      report_type: "financeiro",
      cadencia: "diario",
      ref_date: formatDateOnly(periodoFim),
      source_filename: filename,
      imported_by: userId,
      status: "success",
      rows_imported: grupo.dias.length,
    })
    .select("id")
    .single()
  if (ilErr) throw new Error(`Falha ao criar log: ${ilErr.message}`)

  if (substituido) {
    await admin
      .from("ninefood_daily_loja")
      .delete()
      .eq("unit_id", unit.unitId)
      .in("data", isoDatas)
  }

  const rows = grupo.dias.map((d) => ({
    unit_id: unit.unitId,
    data: formatDateOnly(d.data),
    ref_year: d.data.getFullYear(),
    ref_month: d.data.getMonth() + 1,
    pedidos: d.pedidos,
    bruto: d.bruto,
    liquido: d.liquido,
    ticket_medio: d.ticketMedio,
    comissao_rs: d.comissaoRs,
    taxa_canal_pagamento_rs: d.taxaCanalPagamentoRs,
    promocoes_rs: d.promocoesRs,
    avaliacao_loja: d.avaliacaoLoja,
    taxa_aceitacao_pct: d.taxaAceitacaoPct,
    cancelamentos_qtd: d.cancelamentosQtd,
    tempo_medio_preparo_min: d.tempoMedioPreparoMin,
    import_id: importLog.id,
  }))

  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const { error } = await admin
      .from("ninefood_daily_loja")
      .insert(slice)
    if (error) {
      throw new Error(
        `Falha ao gravar Dados da loja (chunk ${i / CHUNK + 1}): ${error.message}`,
      )
    }
  }

  // Totais pro summary
  let totalPedidos = 0
  let totalBruto = 0
  let totalLiquido = 0
  let somaAvaliacoes = 0
  let countAvaliacoes = 0
  for (const d of grupo.dias) {
    totalPedidos += d.pedidos
    totalBruto += d.bruto
    totalLiquido += d.liquido
    if (d.avaliacaoLoja != null && d.avaliacaoLoja > 0) {
      somaAvaliacoes += d.avaliacaoLoja
      countAvaliacoes += 1
    }
  }
  const avaliacaoMedia =
    countAvaliacoes > 0
      ? Math.round((somaAvaliacoes / countAvaliacoes) * 100) / 100
      : null

  return {
    kind: "ninefood_loja",
    unitCode: unit.code,
    unitName: unit.name,
    storeId: grupo.storeId,
    diasImportados: grupo.dias.length,
    periodoInicio: formatDateOnly(periodoInicio),
    periodoFim: formatDateOnly(periodoFim),
    pedidos: totalPedidos,
    bruto: totalBruto,
    liquido: totalLiquido,
    avaliacao: avaliacaoMedia,
    substituido,
  }
}

// ─── 99 Food: Dados do item ──────────────────────────────────────────

async function processNinefoodDadosItem(
  parsed: ParsedNinefoodDadosItem,
  storeMap: StoreMap,
  filename: string,
  userId: string | null,
  admin: ReturnType<typeof createAdminClient>,
): Promise<ImportFileResult[]> {
  if (parsed.porLoja.length === 0) {
    return [
      {
        filename,
        ok: true,
        message:
          "99 Food — Dados do item: sem itens vendidos no período (arquivo ok, mas vazio).",
      },
    ]
  }
  const results: ImportFileResult[] = []
  const isMulti = parsed.porLoja.length > 1

  for (const grupo of parsed.porLoja) {
    const unit = storeMap.get(grupo.storeId)
    if (!unit) {
      results.push({
        filename: isMulti
          ? `${filename} · loja ${grupo.storeName ?? grupo.storeId}`
          : filename,
        originalFilename: isMulti ? filename : undefined,
        ok: false,
        unmapped: {
          storeId: grupo.storeId,
          platform: "99food",
          cnpj: null,
          suggestedName: grupo.storeName
            ? formatStoreName(grupo.storeName)
            : null,
          suggestedCity: extractCityFromStoreName(grupo.storeName),
          reportTypeLabel: "99 Food — Dados do item",
        },
      })
      continue
    }
    try {
      const summary = await saveNinefoodDadosItem(
        grupo,
        unit,
        filename,
        userId,
        admin,
      )
      results.push({
        filename: isMulti
          ? `${filename} · ${unit.code} ${unit.name}`
          : filename,
        originalFilename: isMulti ? filename : undefined,
        ok: true,
        summary,
      })
    } catch (e) {
      results.push({
        filename: isMulti
          ? `${filename} · ${unit.code} ${unit.name}`
          : filename,
        originalFilename: isMulti ? filename : undefined,
        ok: false,
        message:
          e instanceof Error
            ? e.message
            : `Erro ao gravar Dados do item 99 Food (${grupo.storeId})`,
      })
    }
  }
  return results
}

async function saveNinefoodDadosItem(
  grupo: ParsedNinefoodDadosItem["porLoja"][number],
  unit: { unitId: string; code: string; name: string },
  filename: string,
  userId: string | null,
  admin: ReturnType<typeof createAdminClient>,
): Promise<ImportSummary> {
  if (grupo.itens.length === 0) {
    throw new Error("Nenhum item válido nessa loja.")
  }

  const sortedTs = grupo.itens
    .map((it) => it.data.getTime())
    .sort((a, b) => a - b)
  const periodoInicio = new Date(sortedTs[0])
  const periodoFim = new Date(sortedTs[sortedTs.length - 1])
  const isoDatas = Array.from(
    new Set(grupo.itens.map((it) => formatDateOnly(it.data))),
  )

  const { count: existingCount } = await admin
    .from("ninefood_daily_item")
    .select("id", { count: "exact", head: true })
    .eq("unit_id", unit.unitId)
    .in("data", isoDatas)
  const substituido = (existingCount ?? 0) > 0

  const { data: importLog, error: ilErr } = await admin
    .from("platform_imports")
    .insert({
      unit_id: unit.unitId,
      platform: "99food",
      report_type: "cardapio",
      cadencia: "diario",
      ref_date: formatDateOnly(periodoFim),
      source_filename: filename,
      imported_by: userId,
      status: "success",
      rows_imported: grupo.itens.length,
    })
    .select("id")
    .single()
  if (ilErr) throw new Error(`Falha ao criar log: ${ilErr.message}`)

  if (substituido) {
    await admin
      .from("ninefood_daily_item")
      .delete()
      .eq("unit_id", unit.unitId)
      .in("data", isoDatas)
  }

  const rows = grupo.itens.map((it) => ({
    unit_id: unit.unitId,
    data: formatDateOnly(it.data),
    nome_item: it.nomeItem,
    receita: it.receita,
    qtd_vendida: it.qtdVendida,
    preco_medio: it.precoMedio,
    alcance: it.alcance,
    add_carrinho: it.addCarrinho,
    conversao_pct: it.conversaoPct,
    import_id: importLog.id,
  }))

  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const { error } = await admin.from("ninefood_daily_item").insert(slice)
    if (error) {
      throw new Error(
        `Falha ao gravar Dados do item (chunk ${i / CHUNK + 1}): ${error.message}`,
      )
    }
  }

  const receitaTotal = grupo.itens.reduce((s, it) => s + it.receita, 0)

  return {
    kind: "ninefood_item",
    unitCode: unit.code,
    unitName: unit.name,
    storeId: grupo.storeId,
    diasImportados: isoDatas.length,
    itensCount: grupo.itens.length,
    periodoInicio: formatDateOnly(periodoInicio),
    periodoFim: formatDateOnly(periodoFim),
    receitaTotal,
    substituido,
  }
}

// ─── 99 Food: Dados do pedido ────────────────────────────────────────

/**
 * "Dados do pedido" do 99 Food = 1 linha por pedido (granular).
 * Inclui avaliações com comentário + tags + dados do cliente.
 * Multi-loja (igual avaliações iFood).
 */
async function processNinefoodDadosPedido(
  parsed: ParsedNinefoodDadosPedido,
  storeMap: StoreMap,
  filename: string,
  userId: string | null,
  admin: ReturnType<typeof createAdminClient>,
): Promise<ImportFileResult[]> {
  if (parsed.porLoja.length === 0) {
    return [
      {
        filename,
        ok: true,
        message:
          "99 Food — Dados do pedido: sem pedidos no período (arquivo ok, mas vazio).",
      },
    ]
  }
  const results: ImportFileResult[] = []
  const isMulti = parsed.porLoja.length > 1

  for (const grupo of parsed.porLoja) {
    const unit = storeMap.get(grupo.storeId)
    if (!unit) {
      results.push({
        filename: isMulti
          ? `${filename} · loja ${grupo.storeName ?? grupo.storeId}`
          : filename,
        originalFilename: isMulti ? filename : undefined,
        ok: false,
        unmapped: {
          storeId: grupo.storeId,
          platform: "99food",
          cnpj: null,
          suggestedName: grupo.storeName
            ? formatStoreName(grupo.storeName)
            : null,
          suggestedCity: extractCityFromStoreName(grupo.storeName),
          reportTypeLabel: "99 Food — Dados do pedido",
        },
      })
      continue
    }
    try {
      const summary = await saveNinefoodDadosPedido(
        grupo,
        unit,
        filename,
        userId,
        admin,
      )
      results.push({
        filename: isMulti
          ? `${filename} · ${unit.code} ${unit.name}`
          : filename,
        originalFilename: isMulti ? filename : undefined,
        ok: true,
        summary,
      })
    } catch (e) {
      results.push({
        filename: isMulti
          ? `${filename} · ${unit.code} ${unit.name}`
          : filename,
        originalFilename: isMulti ? filename : undefined,
        ok: false,
        message:
          e instanceof Error
            ? e.message
            : `Erro ao gravar Dados do pedido 99 Food (${grupo.storeId})`,
      })
    }
  }
  return results
}

async function saveNinefoodDadosPedido(
  grupo: ParsedNinefoodDadosPedido["porLoja"][number],
  unit: { unitId: string; code: string; name: string },
  filename: string,
  userId: string | null,
  admin: ReturnType<typeof createAdminClient>,
): Promise<ImportSummary> {
  if (grupo.pedidos.length === 0) {
    throw new Error("Nenhum pedido válido nessa loja.")
  }

  const sortedTs = grupo.pedidos
    .map((p) => p.data.getTime())
    .sort((a, b) => a - b)
  const periodoInicio = new Date(sortedTs[0])
  const periodoFim = new Date(sortedTs[sortedTs.length - 1])

  // Idempotência: pedido_id é único, então a gente faz upsert
  // ON CONFLICT (unit_id, pedido_id) — quem já existe é atualizado
  const pedidoIds = grupo.pedidos.map((p) => p.pedidoId)
  const atualizados = await somaEmLotes(pedidoIds, async (slice) => {
    const { count } = await admin
      .from("ninefood_pedidos")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", unit.unitId)
      .in("pedido_id", slice)
    return count ?? 0
  })
  const novos = grupo.pedidos.length - atualizados
  const substituido = atualizados > 0

  const { data: importLog, error: ilErr } = await admin
    .from("platform_imports")
    .insert({
      unit_id: unit.unitId,
      platform: "99food",
      report_type: "avaliacoes",
      cadencia: "diario",
      ref_date: formatDateOnly(periodoFim),
      source_filename: filename,
      imported_by: userId,
      status: "success",
      rows_imported: grupo.pedidos.length,
    })
    .select("id")
    .single()
  if (ilErr) throw new Error(`Falha ao criar log: ${ilErr.message}`)

  // Constrói rows
  const rows = grupo.pedidos.map((p) => ({
    unit_id: unit.unitId,
    pedido_id: p.pedidoId,
    data: formatDateOnly(p.data),
    ref_year: p.data.getFullYear(),
    ref_month: p.data.getMonth() + 1,

    horario_pedido: p.horarioPedido?.toISOString() ?? null,
    horario_conclusao: p.horarioConclusao?.toISOString() ?? null,
    horario_cancelamento: p.horarioCancelamento?.toISOString() ?? null,
    tempo_pos_venda: p.tempoPosVenda,

    receita_vendas: p.receitaVendas,
    preco_original_item: p.precoOriginalItem,
    receita_real_loja: p.receitaRealLoja,
    despesas_ofertas: p.despesasOfertas,
    despesas_comissao: p.despesasComissao,
    taxa_canal_pagamento: p.taxaCanalPagamento,
    recompensas_plataforma: p.recompensasPlataforma,
    gorjeta: p.gorjeta,
    contagem_item: p.contagemItem,
    taxa_entrega_original: p.taxaEntregaOriginal,
    taxa_entrega_novos_clientes: p.taxaEntregaNovosClientes,

    cliente_id: p.clienteId,
    qtd_pedidos_anteriores_cliente: p.qtdPedidosAnterioresCliente,

    valor_reembolso: p.valorReembolso,
    custo_loja_oferta_entrega_gratis: p.custoLojaOfertaEntregaGratis,
    custos_logisticos: p.custosLogisticos,
    parte_responsavel_cancelamento: p.parteResponsavelCancelamento,
    motivos_cancelamento_comerciante: p.motivosCancelamentoComerciante,

    tempo_preparo_min: p.tempoPreparoMin,
    clicou_pronto_retirada: p.clicouProntoRetirada,
    forma_pagamento: p.formaPagamento,
    metodo_entrega: p.metodoEntrega,
    preparacao_atrasada: p.preparacaoAtrasada,

    tempo_aceitacao_seg: p.tempoAceitacaoSeg,
    tempo_finalizacao_seg: p.tempoFinalizacaoSeg,
    duracao_entrega_seg: p.duracaoEntregaSeg,
    tempo_confirmacao_entregador_seg: p.tempoConfirmacaoEntregadorSeg,
    tempo_entregador_chegada_loja_seg: p.tempoEntregadorChegadaLojaSeg,
    tempo_pedido_pronto_chegada_seg: p.tempoPedidoProntoChegadaSeg,
    tempo_espera_retirada_seg: p.tempoEsperaRetiradaSeg,
    tempo_entregador_cliente_seg: p.tempoEntregadorClienteSeg,
    tempo_espera_cliente_seg: p.tempoEsperaClienteSeg,

    data_avaliacao: p.dataAvaliacao ? formatDateOnly(p.dataAvaliacao) : null,
    nivel_avaliacao: p.nivelAvaliacao,
    conteudo_avaliacao: p.conteudoAvaliacao,
    tag_avaliacao: p.tagAvaliacao,

    import_id: importLog.id,
  }))

  // Upsert em chunks
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const { error } = await admin
      .from("ninefood_pedidos")
      .upsert(slice, { onConflict: "unit_id,pedido_id" })
    if (error) {
      throw new Error(
        `Falha ao gravar pedidos (chunk ${i / CHUNK + 1}): ${error.message}`,
      )
    }
  }

  // Stats pro summary
  let avaliados = 0
  let somaNotas = 0
  let novasAval = 0
  let atualizadasAval = 0
  let clientesNovos = 0
  let clientesRecorrentes = 0
  for (const p of grupo.pedidos) {
    if (p.nivelAvaliacao != null) {
      avaliados++
      somaNotas += p.nivelAvaliacao
    }
    if (p.qtdPedidosAnterioresCliente === 0) clientesNovos++
    else if (
      p.qtdPedidosAnterioresCliente != null &&
      p.qtdPedidosAnterioresCliente > 0
    )
      clientesRecorrentes++
  }
  // Aproxima novas/atualizadas avaliações com base no total novo/atualizado
  // (não é exato, mas dá uma noção pro summary)
  novasAval = Math.round((novos / grupo.pedidos.length) * avaliados)
  atualizadasAval = avaliados - novasAval
  const notaMedia =
    avaliados > 0 ? Math.round((somaNotas / avaliados) * 100) / 100 : null

  return {
    kind: "ninefood_pedido",
    unitCode: unit.code,
    unitName: unit.name,
    storeId: grupo.storeId,
    periodoInicio: formatDateOnly(periodoInicio),
    periodoFim: formatDateOnly(periodoFim),
    pedidos: grupo.pedidos.length,
    avaliados,
    notaMedia,
    novasAvaliacoes: novasAval,
    atualizadasAvaliacoes: atualizadasAval,
    clientesNovos,
    clientesRecorrentes,
    substituido,
  }
}

// ─── Keeta: Loja diária ──────────────────────────────────────────────

async function processKeetaLoja(
  parsed: ParsedKeetaLoja,
  storeMap: StoreMap,
  filename: string,
  userId: string | null,
  admin: ReturnType<typeof createAdminClient>,
): Promise<ImportFileResult[]> {
  const results: ImportFileResult[] = []
  const isMulti = parsed.porLoja.length > 1
  for (const grupo of parsed.porLoja) {
    const unit = storeMap.get(grupo.storeId)
    if (!unit) {
      results.push(
        keetaUnmapped(grupo, filename, isMulti, "Keeta — Loja diária"),
      )
      continue
    }
    try {
      const summary = await saveKeetaLoja(grupo, unit, filename, userId, admin)
      results.push(keetaOk(unit, filename, isMulti, summary))
    } catch (e) {
      results.push(keetaErr(unit, filename, isMulti, e, "Loja diária"))
    }
  }
  return results
}

async function saveKeetaLoja(
  grupo: ParsedKeetaLoja["porLoja"][number],
  unit: { unitId: string; code: string; name: string },
  filename: string,
  userId: string | null,
  admin: ReturnType<typeof createAdminClient>,
): Promise<ImportSummary> {
  if (grupo.dias.length === 0) throw new Error("Nenhum dia válido nessa loja.")

  const sortedTs = grupo.dias.map((d) => d.data.getTime()).sort((a, b) => a - b)
  const periodoInicio = new Date(sortedTs[0])
  const periodoFim = new Date(sortedTs[sortedTs.length - 1])
  const isoDatas = grupo.dias.map((d) => formatDateOnly(d.data))

  const { count: existingCount } = await admin
    .from("keeta_daily_loja")
    .select("id", { count: "exact", head: true })
    .eq("unit_id", unit.unitId)
    .in("data", isoDatas)
  const substituido = (existingCount ?? 0) > 0

  const { data: importLog, error: ilErr } = await admin
    .from("platform_imports")
    .insert({
      unit_id: unit.unitId,
      platform: "keeta",
      report_type: "financeiro",
      cadencia: "diario",
      ref_date: formatDateOnly(periodoFim),
      source_filename: filename,
      imported_by: userId,
      status: "success",
      rows_imported: grupo.dias.length,
    })
    .select("id")
    .single()
  if (ilErr) throw new Error(`Falha ao criar log: ${ilErr.message}`)

  if (substituido) {
    await admin
      .from("keeta_daily_loja")
      .delete()
      .eq("unit_id", unit.unitId)
      .in("data", isoDatas)
  }

  const rows = grupo.dias.map((d) => ({
    unit_id: unit.unitId,
    data: formatDateOnly(d.data),
    ref_year: d.data.getFullYear(),
    ref_month: d.data.getMonth() + 1,
    vendas_itens: d.vendasItens,
    pedidos_validos: d.pedidosValidos,
    total_pedidos: d.totalPedidos,
    pedidos_cancelados: d.pedidosCancelados,
    valor_medio_pedido: d.valorMedioPedido,
    alcance_clientes: d.alcanceClientes,
    visitantes: d.visitantes,
    add_carrinho: d.addCarrinho,
    clientes_finalizados: d.clientesFinalizados,
    taxa_conv_exposicao_visita: d.taxaConvExposicaoVisita,
    taxa_conv_visita_carrinho: d.taxaConvVisitaCarrinho,
    vendas_promocao: d.vendasPromocao,
    num_campanhas: d.numCampanhas,
    despesa_unidade: d.despesaUnidade,
    tempo_aberto_h: d.tempoAbertoH,
    tempo_preparo_min: d.tempoPreparoMin,
    import_id: importLog.id,
  }))

  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin
      .from("keeta_daily_loja")
      .insert(rows.slice(i, i + CHUNK))
    if (error)
      throw new Error(
        `Falha ao gravar Loja diária (chunk ${i / CHUNK + 1}): ${error.message}`,
      )
  }

  let pedidos = 0
  let bruto = 0
  let cancelados = 0
  for (const d of grupo.dias) {
    pedidos += d.totalPedidos
    bruto += d.vendasItens
    cancelados += d.pedidosCancelados
  }

  return {
    kind: "keeta_loja",
    unitCode: unit.code,
    unitName: unit.name,
    storeId: grupo.storeId,
    diasImportados: grupo.dias.length,
    periodoInicio: formatDateOnly(periodoInicio),
    periodoFim: formatDateOnly(periodoFim),
    pedidos,
    bruto,
    cancelados,
    substituido,
  }
}

// ─── Keeta: Itens diário ─────────────────────────────────────────────

async function processKeetaItens(
  parsed: ParsedKeetaItem,
  storeMap: StoreMap,
  filename: string,
  userId: string | null,
  admin: ReturnType<typeof createAdminClient>,
): Promise<ImportFileResult[]> {
  const results: ImportFileResult[] = []
  const isMulti = parsed.porLoja.length > 1
  for (const grupo of parsed.porLoja) {
    const unit = storeMap.get(grupo.storeId)
    if (!unit) {
      results.push(
        keetaUnmapped(grupo, filename, isMulti, "Keeta — Itens diário"),
      )
      continue
    }
    try {
      const summary = await saveKeetaItens(grupo, unit, filename, userId, admin)
      results.push(keetaOk(unit, filename, isMulti, summary))
    } catch (e) {
      results.push(keetaErr(unit, filename, isMulti, e, "Itens diário"))
    }
  }
  return results
}

async function saveKeetaItens(
  grupo: ParsedKeetaItem["porLoja"][number],
  unit: { unitId: string; code: string; name: string },
  filename: string,
  userId: string | null,
  admin: ReturnType<typeof createAdminClient>,
): Promise<ImportSummary> {
  if (grupo.itens.length === 0) throw new Error("Nenhum item válido nessa loja.")

  const sortedTs = grupo.itens.map((it) => it.data.getTime()).sort((a, b) => a - b)
  const periodoInicio = new Date(sortedTs[0])
  const periodoFim = new Date(sortedTs[sortedTs.length - 1])
  const isoDatas = Array.from(
    new Set(grupo.itens.map((it) => formatDateOnly(it.data))),
  )

  const { count: existingCount } = await admin
    .from("keeta_daily_item")
    .select("id", { count: "exact", head: true })
    .eq("unit_id", unit.unitId)
    .in("data", isoDatas)
  const substituido = (existingCount ?? 0) > 0

  const { data: importLog, error: ilErr } = await admin
    .from("platform_imports")
    .insert({
      unit_id: unit.unitId,
      platform: "keeta",
      report_type: "cardapio",
      cadencia: "diario",
      ref_date: formatDateOnly(periodoFim),
      source_filename: filename,
      imported_by: userId,
      status: "success",
      rows_imported: grupo.itens.length,
    })
    .select("id")
    .single()
  if (ilErr) throw new Error(`Falha ao criar log: ${ilErr.message}`)

  if (substituido) {
    await admin
      .from("keeta_daily_item")
      .delete()
      .eq("unit_id", unit.unitId)
      .in("data", isoDatas)
  }

  // Dedupe por (data, nome_item): o Keeta pode exportar o mesmo item 2× no
  // mesmo dia (combos, variações). Soma qtd_vendida; preço médio fica o do
  // último (ou maior, pra não diminuir). Sem isso, viola a constraint UNIQUE
  // (unit_id, data, nome_item).
  type Row = {
    unit_id: string
    data: string
    ref_year: number
    ref_month: number
    item_id: string | null
    nome_item: string
    qtd_vendida: number
    preco_medio: number
    alcance: number | null
    add_carrinho: number | null
    carrinho_pct: number | null
    import_id: string
  }
  const dedupe = new Map<string, Row>()
  for (const it of grupo.itens) {
    const dataStr = formatDateOnly(it.data)
    const key = `${dataStr}|${it.nomeItem}`
    const existing = dedupe.get(key)
    if (existing) {
      existing.qtd_vendida += it.qtdVendida
      if (it.precoMedio > existing.preco_medio) existing.preco_medio = it.precoMedio
      if (it.alcance != null)
        existing.alcance = Math.max(existing.alcance ?? 0, it.alcance)
      if (it.addCarrinho != null)
        existing.add_carrinho = Math.max(existing.add_carrinho ?? 0, it.addCarrinho)
      continue
    }
    dedupe.set(key, {
      unit_id: unit.unitId,
      data: dataStr,
      ref_year: it.data.getFullYear(),
      ref_month: it.data.getMonth() + 1,
      item_id: it.itemId,
      nome_item: it.nomeItem,
      qtd_vendida: it.qtdVendida,
      preco_medio: it.precoMedio,
      alcance: it.alcance,
      add_carrinho: it.addCarrinho,
      carrinho_pct: it.carrinhoPct,
      import_id: importLog.id,
    })
  }
  const rows = Array.from(dedupe.values())

  // Usa upsert pra ser idempotente — se a dedupe acima falhar em algum caso
  // não previsto, o segundo registro sobrescreve em vez de quebrar tudo.
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin
      .from("keeta_daily_item")
      .upsert(rows.slice(i, i + CHUNK), {
        onConflict: "unit_id,data,nome_item",
      })
    if (error)
      throw new Error(
        `Falha ao gravar Itens diário (chunk ${i / CHUNK + 1}): ${error.message}`,
      )
  }

  const receitaTotal = grupo.itens.reduce(
    (s, it) => s + it.qtdVendida * it.precoMedio,
    0,
  )

  return {
    kind: "keeta_item",
    unitCode: unit.code,
    unitName: unit.name,
    storeId: grupo.storeId,
    diasImportados: isoDatas.length,
    itensCount: grupo.itens.length,
    periodoInicio: formatDateOnly(periodoInicio),
    periodoFim: formatDateOnly(periodoFim),
    receitaTotal,
    substituido,
  }
}

// ─── Keeta: Pedidos ──────────────────────────────────────────────────

async function processKeetaPedidos(
  parsed: ParsedKeetaPedidos,
  storeMap: StoreMap,
  filename: string,
  userId: string | null,
  admin: ReturnType<typeof createAdminClient>,
): Promise<ImportFileResult[]> {
  const results: ImportFileResult[] = []
  const isMulti = parsed.porLoja.length > 1
  for (const grupo of parsed.porLoja) {
    const unit = storeMap.get(grupo.storeId)
    if (!unit) {
      results.push(keetaUnmapped(grupo, filename, isMulti, "Keeta — Pedidos"))
      continue
    }
    try {
      const summary = await saveKeetaPedidos(
        grupo,
        unit,
        filename,
        userId,
        admin,
      )
      results.push(keetaOk(unit, filename, isMulti, summary))
    } catch (e) {
      results.push(keetaErr(unit, filename, isMulti, e, "Pedidos"))
    }
  }
  return results
}

async function saveKeetaPedidos(
  grupo: ParsedKeetaPedidos["porLoja"][number],
  unit: { unitId: string; code: string; name: string },
  filename: string,
  userId: string | null,
  admin: ReturnType<typeof createAdminClient>,
): Promise<ImportSummary> {
  if (grupo.pedidos.length === 0)
    throw new Error("Nenhum pedido válido nessa loja.")

  const sortedTs = grupo.pedidos
    .map((p) => p.data.getTime())
    .sort((a, b) => a - b)
  const periodoInicio = new Date(sortedTs[0])
  const periodoFim = new Date(sortedTs[sortedTs.length - 1])

  const pedidoIds = grupo.pedidos.map((p) => p.pedidoId)
  const existingCount = await somaEmLotes(pedidoIds, async (slice) => {
    const { count } = await admin
      .from("keeta_pedidos")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", unit.unitId)
      .in("pedido_id", slice)
    return count ?? 0
  })
  const substituido = existingCount > 0

  const { data: importLog, error: ilErr } = await admin
    .from("platform_imports")
    .insert({
      unit_id: unit.unitId,
      platform: "keeta",
      report_type: "vendas",
      cadencia: "diario",
      ref_date: formatDateOnly(periodoFim),
      source_filename: filename,
      imported_by: userId,
      status: "success",
      rows_imported: grupo.pedidos.length,
    })
    .select("id")
    .single()
  if (ilErr) throw new Error(`Falha ao criar log: ${ilErr.message}`)

  const rows = grupo.pedidos.map((p) => ({
    unit_id: unit.unitId,
    pedido_id: p.pedidoId,
    data: formatDateOnly(p.data),
    ref_year: p.data.getFullYear(),
    ref_month: p.data.getMonth() + 1,
    tipo_pedido: p.tipoPedido,
    horario_pedido: p.horarioPedido?.toISOString() ?? null,
    horario_conclusao: p.horarioConclusao?.toISOString() ?? null,
    status_pedido: p.statusPedido,
    tipo_cancelamento: p.tipoCancelamento,
    motivo_cancelamento: p.motivoCancelamento,
    ganhos_liquidos: p.ganhosLiquidos,
    vendas_itens: p.vendasItens,
    outros_ganhos: p.outrosGanhos,
    despesa: p.despesa,
    despesas_plataforma: p.despesasPlataforma,
    comissao: p.comissao,
    outras_despesas: p.outrasDespesas,
    taxa_entrega: p.taxaEntrega,
    detalhe_item: p.detalheItem,
    tempo_preparo_min: p.tempoPreparoMin,
    data_avaliacao: p.dataAvaliacao ? formatDateOnly(p.dataAvaliacao) : null,
    pontuacao_avaliacao: p.pontuacaoAvaliacao,
    conteudo_avaliacao: p.conteudoAvaliacao,
    resposta_avaliacao: p.respostaAvaliacao,
    import_id: importLog.id,
  }))

  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin
      .from("keeta_pedidos")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "unit_id,pedido_id" })
    if (error)
      throw new Error(
        `Falha ao gravar Pedidos (chunk ${i / CHUNK + 1}): ${error.message}`,
      )
  }

  let bruto = 0
  let liquido = 0
  let avaliados = 0
  let somaNotas = 0
  for (const p of grupo.pedidos) {
    bruto += p.vendasItens ?? 0
    liquido += p.ganhosLiquidos ?? 0
    if (p.pontuacaoAvaliacao != null) {
      avaliados++
      somaNotas += p.pontuacaoAvaliacao
    }
  }

  return {
    kind: "keeta_pedido",
    unitCode: unit.code,
    unitName: unit.name,
    storeId: grupo.storeId,
    periodoInicio: formatDateOnly(periodoInicio),
    periodoFim: formatDateOnly(periodoFim),
    pedidos: grupo.pedidos.length,
    bruto,
    liquido,
    avaliados,
    notaMedia:
      avaliados > 0 ? Math.round((somaNotas / avaliados) * 100) / 100 : null,
    substituido,
  }
}

// ─── Keeta: Pedidos recentes (promoção Keeta×loja + taxas granulares) ─

async function processKeetaPedidosRecentes(
  parsed: ParsedKeetaPedidosRecentes,
  storeMap: StoreMap,
  filename: string,
  userId: string | null,
  admin: ReturnType<typeof createAdminClient>,
): Promise<ImportFileResult[]> {
  const results: ImportFileResult[] = []
  const isMulti = parsed.porLoja.length > 1
  for (const grupo of parsed.porLoja) {
    const unit = storeMap.get(grupo.storeId)
    if (!unit) {
      results.push(
        keetaUnmapped(grupo, filename, isMulti, "Keeta — Pedidos recentes"),
      )
      continue
    }
    try {
      const summary = await saveKeetaPedidosRecentes(
        grupo,
        unit,
        filename,
        userId,
        admin,
      )
      results.push(keetaOk(unit, filename, isMulti, summary))
    } catch (e) {
      results.push(keetaErr(unit, filename, isMulti, e, "Pedidos recentes"))
    }
  }
  return results
}

async function saveKeetaPedidosRecentes(
  grupo: ParsedKeetaPedidosRecentes["porLoja"][number],
  unit: { unitId: string; code: string; name: string },
  filename: string,
  userId: string | null,
  admin: ReturnType<typeof createAdminClient>,
): Promise<ImportSummary> {
  if (grupo.pedidos.length === 0)
    throw new Error("Nenhum pedido válido nessa loja.")

  const sortedTs = grupo.pedidos
    .map((p) => p.data.getTime())
    .sort((a, b) => a - b)
  const periodoInicio = new Date(sortedTs[0])
  const periodoFim = new Date(sortedTs[sortedTs.length - 1])

  const numeros = grupo.pedidos.map((p) => p.numeroPedido)
  const atualizados = await somaEmLotes(numeros, async (slice) => {
    const { count } = await admin
      .from("keeta_pedidos_recentes")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", unit.unitId)
      .in("numero_pedido", slice)
    return count ?? 0
  })
  const novos = grupo.pedidos.length - atualizados

  const { data: importLog, error: ilErr } = await admin
    .from("platform_imports")
    .insert({
      unit_id: unit.unitId,
      platform: "keeta",
      report_type: "vendas",
      cadencia: "diario",
      ref_date: formatDateOnly(periodoFim),
      source_filename: filename,
      imported_by: userId,
      status: "success",
      rows_imported: grupo.pedidos.length,
    })
    .select("id")
    .single()
  if (ilErr) throw new Error(`Falha ao criar log: ${ilErr.message}`)

  const rows = grupo.pedidos.map((p) => ({
    unit_id: unit.unitId,
    numero_pedido: p.numeroPedido,
    numero_pedido_curto: p.numeroPedidoCurto,
    data: formatDateOnly(p.data),
    ref_year: p.data.getFullYear(),
    ref_month: p.data.getMonth() + 1,
    horario_pedido: p.horarioPedido?.toISOString() ?? null,
    horario_conclusao: p.horarioConclusao?.toISOString() ?? null,
    horario_cancelamento: p.horarioCancelamento?.toISOString() ?? null,
    turno: p.turno,
    status_pedido: p.statusPedido,
    tipo_reembolso: p.tipoReembolso,
    motivo_cancelamento: p.motivoCancelamento,
    quem_cancelou: p.quemCancelou,
    responsabilidade: p.responsabilidade,
    motivo_decisao: p.motivoDecisao,
    itens: p.itens,
    tipo_campanha: p.tipoCampanha,
    ganhos: p.ganhos,
    valor_pago_cliente: p.valorPagoCliente,
    preco_original: p.precoOriginal,
    ressarcimento_plataforma: p.ressarcimentoPlataforma,
    comissao_basica: p.comissaoBasica,
    taxa_distancia: p.taxaDistancia,
    taxa_saque_antecipado: p.taxaSaqueAntecipado,
    taxa_pagamento_online: p.taxaPagamentoOnline,
    diferenca_paga: p.diferencaPaga,
    desconto_keeta: p.descontoKeeta,
    promo_keeta: p.promoKeeta,
    promo_loja: p.promoLoja,
    import_id: importLog.id,
  }))

  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin
      .from("keeta_pedidos_recentes")
      .upsert(rows.slice(i, i + CHUNK), {
        onConflict: "unit_id,numero_pedido",
      })
    if (error)
      throw new Error(
        `Falha ao gravar Pedidos recentes (chunk ${i / CHUNK + 1}): ${error.message}`,
      )
  }

  let concluidos = 0
  let cancelados = 0
  let promoKeeta = 0
  let promoLoja = 0
  for (const p of grupo.pedidos) {
    if (p.statusPedido === "Concluído") concluidos++
    else if (p.statusPedido === "Cancelado") cancelados++
    promoKeeta += p.promoKeeta ?? 0
    promoLoja += Math.abs(p.promoLoja ?? 0)
  }

  return {
    kind: "keeta_pedido_recente",
    unitCode: unit.code,
    unitName: unit.name,
    storeId: grupo.storeId,
    periodoInicio: formatDateOnly(periodoInicio),
    periodoFim: formatDateOnly(periodoFim),
    pedidos: grupo.pedidos.length,
    concluidos,
    cancelados,
    promoKeeta: Math.round(promoKeeta * 100) / 100,
    promoLoja: Math.round(promoLoja * 100) / 100,
    novos,
    atualizados,
  }
}

// ─── Keeta: helpers de result (reduzem boilerplate) ──────────────────

function keetaUnmapped(
  grupo: { storeId: string; storeName: string | null },
  filename: string,
  isMulti: boolean,
  reportTypeLabel: string,
): ImportFileResult {
  return {
    filename: isMulti
      ? `${filename} · loja ${grupo.storeName ?? grupo.storeId}`
      : filename,
    originalFilename: isMulti ? filename : undefined,
    ok: false,
    unmapped: {
      storeId: grupo.storeId,
      platform: "keeta",
      cnpj: null,
      suggestedName: grupo.storeName ? formatStoreName(grupo.storeName) : null,
      suggestedCity: extractCityFromStoreName(grupo.storeName),
      reportTypeLabel,
    },
  }
}

function keetaOk(
  unit: { code: string; name: string },
  filename: string,
  isMulti: boolean,
  summary: ImportSummary,
): ImportFileResult {
  return {
    filename: isMulti ? `${filename} · ${unit.code} ${unit.name}` : filename,
    originalFilename: isMulti ? filename : undefined,
    ok: true,
    summary,
  }
}

function keetaErr(
  unit: { code: string; name: string },
  filename: string,
  isMulti: boolean,
  e: unknown,
  label: string,
): ImportFileResult {
  return {
    filename: isMulti ? `${filename} · ${unit.code} ${unit.name}` : filename,
    originalFilename: isMulti ? filename : undefined,
    ok: false,
    message: e instanceof Error ? e.message : `Erro ao gravar ${label} Keeta`,
  }
}

// ─── Persistência: Cardápio ──────────────────────────────────────────

async function saveCardapio(
  parsed: ParsedCardapio,
  unit: { unitId: string; code: string; name: string },
  filename: string,
  userId: string | null,
  admin: ReturnType<typeof createAdminClient>,
): Promise<ImportSummary> {
  if (!parsed.period.isDaily) {
    throw new Error(
      `Esse Cardápio é de um período (${parsed.period.raw}), não 1 dia. Baixa do iFood com período = 1 dia.`,
    )
  }
  const date = formatDateOnly(parsed.period.start)

  const { data: existing } = await admin
    .from("ifood_daily_funnel")
    .select("unit_id")
    .eq("unit_id", unit.unitId)
    .eq("date", date)
    .maybeSingle()
  const substituido = !!existing

  const { data: importLog, error: ilErr } = await admin
    .from("platform_imports")
    .insert({
      unit_id: unit.unitId,
      platform: "ifood",
      report_type: "cardapio",
      cadencia: "diario",
      ref_date: date,
      source_filename: filename,
      imported_by: userId,
      status: "success",
      rows_imported: 1 + parsed.items.length + parsed.complementos.length,
    })
    .select("id")
    .single()
  if (ilErr) throw new Error(`Falha ao criar log: ${ilErr.message}`)

  if (substituido) {
    await admin
      .from("ifood_daily_funnel")
      .delete()
      .eq("unit_id", unit.unitId)
      .eq("date", date)
    await admin
      .from("ifood_daily_items")
      .delete()
      .eq("unit_id", unit.unitId)
      .eq("date", date)
    await admin
      .from("ifood_daily_complementos")
      .delete()
      .eq("unit_id", unit.unitId)
      .eq("date", date)
  }

  const { error: fErr } = await admin.from("ifood_daily_funnel").insert({
    unit_id: unit.unitId,
    date,
    visitas: parsed.funnel.visitas,
    visualizacoes: parsed.funnel.visualizacoes,
    sacola: parsed.funnel.sacola,
    revisao: parsed.funnel.revisao,
    concluidos: parsed.funnel.concluidos,
    conversao_pct: parsed.funnel.conversaoPct,
    visitas_anterior: parsed.funnel.visitasAnterior,
    visualizacoes_anterior: parsed.funnel.visualizacoesAnterior,
    sacola_anterior: parsed.funnel.sacolaAnterior,
    revisao_anterior: parsed.funnel.revisaoAnterior,
    concluidos_anterior: parsed.funnel.concluidosAnterior,
    conversao_pct_anterior: parsed.funnel.conversaoPctAnterior,
    import_id: importLog.id,
  })
  if (fErr) throw new Error(`Falha ao gravar funil: ${fErr.message}`)

  if (parsed.items.length > 0) {
    const { error: iErr } = await admin.from("ifood_daily_items").insert(
      parsed.items.map((item) => ({
        unit_id: unit.unitId,
        date,
        categoria: item.categoria,
        nome_item: item.nomeItem,
        visitas: item.visitas,
        pedidos: item.pedidos,
        conversao_pct: item.conversaoPct,
        qtd_vendida: item.qtdVendida,
        qtd_com_promocao: item.qtdComPromocao,
        pedidos_com_promocao: item.pedidosComPromocao,
        valor_total: item.valorTotal,
        import_id: importLog.id,
      })),
    )
    if (iErr) throw new Error(`Falha ao gravar itens: ${iErr.message}`)
  }

  if (parsed.complementos.length > 0) {
    const { error: cErr } = await admin
      .from("ifood_daily_complementos")
      .insert(
        parsed.complementos.map((c) => ({
          unit_id: unit.unitId,
          date,
          classificacao: c.classificacao,
          nome_complemento: c.nomeComplemento,
          lojas: c.lojas,
          pedidos: c.pedidos,
          qtd_vendida: c.qtdVendida,
          valor_total: c.valorTotal,
          import_id: importLog.id,
        })),
      )
    if (cErr) throw new Error(`Falha ao gravar complementos: ${cErr.message}`)
  }

  const valorBrutoItens = parsed.items.reduce(
    (acc, it) => acc + (it.valorTotal || 0),
    0,
  )

  return {
    kind: "cardapio",
    unitCode: unit.code,
    unitName: unit.name,
    storeId: parsed.storeId,
    date,
    pedidos: parsed.funnel.concluidos,
    conversao: parsed.funnel.conversaoPct ?? 0,
    valorBrutoItens,
    itensCount: parsed.items.length,
    complementosCount: parsed.complementos.length,
    substituido,
  }
}

// ─── Persistência: Financeiro ────────────────────────────────────────

async function saveFinanceiro(
  parsed: ParsedFinanceiro,
  unit: { unitId: string; code: string; name: string },
  filename: string,
  userId: string | null,
  admin: ReturnType<typeof createAdminClient>,
): Promise<ImportSummary> {
  // Dedupe POR COMPETÊNCIA, não pelo mês do cabeçalho. Um arquivo pode trazer
  // lançamentos de mais de uma competência (o iFood às vezes mistura repasses
  // de meses vizinhos); apagar só parsed.refMonth deixava as outras
  // competências acumularem (duplicar) a cada reimportação. A coluna
  // 'competencia' é a chave de período confiável do schema (0007).
  const competencias = [
    ...new Set(parsed.lancamentos.map((l) => l.competencia)),
  ].filter(Boolean)

  const { count: existingCount } = await admin
    .from("ifood_financeiro_lancamentos")
    .select("id", { count: "exact", head: true })
    .eq("unit_id", unit.unitId)
    .in("competencia", competencias.length > 0 ? competencias : ["__none__"])
  const substituido = (existingCount ?? 0) > 0

  const { data: importLog, error: ilErr } = await admin
    .from("platform_imports")
    .insert({
      unit_id: unit.unitId,
      platform: "ifood",
      report_type: "financeiro",
      cadencia: "mensal",
      ref_year: parsed.refYear,
      ref_month: parsed.refMonth,
      source_filename: filename,
      imported_by: userId,
      status: "success",
      rows_imported: parsed.lancamentos.length,
    })
    .select("id")
    .single()
  if (ilErr) throw new Error(`Falha ao criar log: ${ilErr.message}`)

  if (substituido) {
    await admin
      .from("ifood_financeiro_lancamentos")
      .delete()
      .eq("unit_id", unit.unitId)
      .in("competencia", competencias)
  }

  // Conciliação do iFood tem MUITOS lançamentos (22k+ por loja/mês). Chunks
  // grandes cortam os round-trips ao Postgres — o gargalo do import (várias
  // lojas de uma vez estourava o timeout da função serverless).
  const CHUNK = 5000
  const rows = parsed.lancamentos.map((l) => ({
    unit_id: unit.unitId,
    competencia: l.competencia,
    ref_year: l.refYear,
    ref_month: l.refMonth,
    data_fato_gerador: toIso(l.dataFatoGerador),
    fato_gerador: l.fatoGerador,
    tipo_lancamento: l.tipoLancamento,
    descricao_lancamento: l.descricaoLancamento,
    valor: l.valor,
    base_calculo: l.baseCalculo,
    percentual_taxa: l.percentualTaxa,
    valor_transacao: l.valorTransacao,
    valor_cesta_inicial: l.valorCestaInicial,
    valor_cesta_final: l.valorCestaFinal,
    pedido_associado_ifood: l.pedidoAssociadoIfood,
    pedido_associado_ifood_curto: l.pedidoAssociadoIfoodCurto,
    pedido_associado_externo: l.pedidoAssociadoExterno,
    motivo_cancelamento: l.motivoCancelamento,
    descricao_ocorrencia: l.descricaoOcorrencia,
    data_criacao_pedido: toIso(l.dataCriacaoPedido),
    data_repasse_esperada: formatDateOnly(l.dataRepasseEsperada),
    data_faturamento: toIso(l.dataFaturamento),
    data_apuracao_inicio: formatDateOnly(l.dataApuracaoInicio),
    data_apuracao_fim: formatDateOnly(l.dataApuracaoFim),
    responsavel_transacao: l.responsavelTransacao,
    canal_vendas: l.canalVendas,
    impacto_no_repasse: l.impactoNoRepasse,
    parcela_pagamento: l.parcelaPagamento,
    id_saldo: l.idSaldo,
    import_id: importLog.id,
  }))

  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const { error } = await admin
      .from("ifood_financeiro_lancamentos")
      .insert(slice)
    if (error) {
      throw new Error(
        `Falha ao gravar lançamentos (chunk ${i / CHUNK + 1}): ${error.message}`,
      )
    }
  }

  return {
    kind: "financeiro",
    unitCode: unit.code,
    unitName: unit.name,
    storeId: parsed.storeId,
    competencia: parsed.competencia,
    pedidosUnicos: parsed.totals.pedidosUnicos,
    bruto: parsed.totals.bruto,
    liquido: parsed.totals.liquido,
    cancelTotalQtd: parsed.totals.cancelamentoTotalQtd,
    cancelParcialQtd: parsed.totals.cancelamentoParcialQtd,
    lancamentos: parsed.lancamentos.length,
    substituido,
  }
}

// ─── Persistência: Avaliações (por loja) ────────────────────────────

async function saveAvaliacoesPorLoja(
  grupo: ParsedAvaliacoes["porLoja"][number],
  unit: { unitId: string; code: string; name: string },
  filename: string,
  userId: string | null,
  admin: ReturnType<typeof createAdminClient>,
): Promise<ImportSummary> {
  if (grupo.avaliacoes.length === 0) {
    throw new Error("Nenhuma avaliação válida pra essa loja")
  }

  // Período coberto (min/max das datas)
  const datas = grupo.avaliacoes
    .map((a) => a.dataAvaliacao.getTime())
    .sort((a, b) => a - b)
  const periodoInicio = new Date(datas[0])
  const periodoFim = new Date(datas[datas.length - 1])

  // Log
  const { data: importLog, error: ilErr } = await admin
    .from("platform_imports")
    .insert({
      unit_id: unit.unitId,
      platform: "ifood",
      report_type: "avaliacoes",
      cadencia: "diario", // avaliações são por período mas tratamos como diário pro histórico
      ref_date: formatDateOnly(periodoFim),
      source_filename: filename,
      imported_by: userId,
      status: "success",
      rows_imported: grupo.avaliacoes.length,
    })
    .select("id")
    .single()
  if (ilErr) throw new Error(`Falha ao criar log: ${ilErr.message}`)

  // Conta quantas eram novas vs atualizadas (pra mostrar no summary)
  const longIds = grupo.avaliacoes
    .map((a) => a.pedidoIdLongo)
    .filter((id): id is string => !!id)
  let existingCount = 0
  if (longIds.length > 0) {
    existingCount = await somaEmLotes(longIds, async (slice) => {
      const { count } = await admin
        .from("ifood_avaliacoes")
        .select("id", { count: "exact", head: true })
        .eq("unit_id", unit.unitId)
        .in("pedido_id_longo", slice)
      return count ?? 0
    })
  }
  const novas = grupo.avaliacoes.length - existingCount
  const atualizadas = existingCount

  // Upsert em chunks (ON CONFLICT (unit_id, pedido_id_longo))
  const CHUNK = 500
  const rows = grupo.avaliacoes
    .filter((a) => a.pedidoIdLongo) // sem id longo não dá pra fazer ON CONFLICT
    .map((a) => ({
      unit_id: unit.unitId,
      pedido_id_curto: a.pedidoIdCurto,
      pedido_id_longo: a.pedidoIdLongo,
      data_pedido: a.dataPedido ? a.dataPedido.toISOString() : null,
      status_pedido: a.statusPedido,
      servico_logistico: a.servicoLogistico,
      data_avaliacao: formatDateOnly(a.dataAvaliacao),
      nota: a.nota,
      comentario: a.comentario,
      status_avaliacao: a.statusAvaliacao,
      tags_positivas: a.tagsPositivas,
      tags_negativas: a.tagsNegativas,
      import_id: importLog.id,
    }))

  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const { error } = await admin
      .from("ifood_avaliacoes")
      .upsert(slice, { onConflict: "unit_id,pedido_id_longo" })
    if (error) {
      throw new Error(
        `Falha ao gravar avaliações (chunk ${i / CHUNK + 1}): ${error.message}`,
      )
    }
  }

  // Estatísticas pro summary
  const dist: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let comComentario = 0
  let somaNotas = 0
  for (const a of grupo.avaliacoes) {
    const k = a.nota as 1 | 2 | 3 | 4 | 5
    dist[k] += 1
    somaNotas += a.nota
    if (a.comentario && a.comentario.trim().length > 0) comComentario++
  }
  const notaMedia = somaNotas / grupo.avaliacoes.length

  return {
    kind: "avaliacoes",
    unitCode: unit.code,
    unitName: unit.name,
    storeId: grupo.storeId,
    periodoInicio: formatDateOnly(periodoInicio),
    periodoFim: formatDateOnly(periodoFim),
    totalAvaliacoes: grupo.avaliacoes.length,
    notaMedia: Math.round(notaMedia * 100) / 100,
    distribucao: dist,
    comComentario,
    novas,
    atualizadas,
  }
}

// ─── Criar unidade a partir de relatório não-mapeado ────────────────

export type CreateUnitAndImportState = {
  ok: boolean
  message?: string
  result?: ImportFileResult
}

/**
 * Cria uma unidade nova com os dados informados pelo usuário (vindos
 * do modal "Criar e importar") e logo importa o arquivo XLSX anexado.
 */
export async function createUnitAndImport(
  _prev: CreateUnitAndImportState,
  formData: FormData,
): Promise<CreateUnitAndImportState> {
  let userId: string
  try {
    ;({ userId } = await requireModulePermission("importacao", "edit"))
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Não autenticado" }
  }
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Arquivo não recebido. Selecione de novo." }
  }
  const name = String(formData.get("name") ?? "").trim()
  const city = String(formData.get("city") ?? "").trim()
  const stateUf = String(formData.get("state") ?? "")
    .trim()
    .toUpperCase()
  const cnpjRaw = String(formData.get("cnpj") ?? "").trim()
  // Lê novo formato (storeId + platform) com fallback pro antigo (ifoodStoreId)
  const storeId = String(
    formData.get("storeId") ?? formData.get("ifoodStoreId") ?? "",
  ).trim()
  const detectedPlatform = String(formData.get("platform") ?? "ifood").trim()
  const sourcePlatform: "ifood" | "99food" | "keeta" =
    detectedPlatform === "99food"
      ? "99food"
      : detectedPlatform === "keeta"
        ? "keeta"
        : "ifood"
  const active = formData.get("active") === "on"
  const ALL_PLATFORMS = ["ifood", "99food", "keeta"] as const
  type PlatformId = (typeof ALL_PLATFORMS)[number]
  const platformsRaw = formData.getAll("platforms").map(String)
  const platforms: PlatformId[] = ALL_PLATFORMS.filter((p) =>
    platformsRaw.includes(p),
  )
  // Garante a plataforma de origem na lista (foi como descobrimos essa loja)
  if (!platforms.includes(sourcePlatform)) platforms.unshift(sourcePlatform)

  if (!name) return { ok: false, message: "Nome obrigatório." }
  if (!city) return { ok: false, message: "Cidade obrigatória." }
  if (!stateUf || stateUf.length !== 2)
    return { ok: false, message: "UF deve ter 2 letras (ex.: SP)." }
  const platformLabel =
    sourcePlatform === "ifood"
      ? "iFood"
      : sourcePlatform === "keeta"
        ? "Keeta"
        : "99 Food"
  if (!storeId)
    return { ok: false, message: `ID ${platformLabel} obrigatório.` }

  const admin = createAdminClient()

  // Verifica se o storeId já está vinculado a alguém (corrida)
  const { data: existing } = await admin
    .from("unit_platforms")
    .select("unit_id")
    .eq("platform", sourcePlatform)
    .eq("external_store_id", storeId)
    .maybeSingle()
  if (existing) {
    return {
      ok: false,
      message: `Loja ${platformLabel} ${storeId} já está vinculada a outra unidade. Recarrega e sobe o arquivo de novo.`,
    }
  }

  // Pega marca padrão
  const { data: brand, error: bErr } = await admin
    .from("brands")
    .select("id")
    .eq("slug", "churrasco-no-pote")
    .maybeSingle()
  if (bErr || !brand) {
    return {
      ok: false,
      message: "Marca padrão não encontrada — rodou as migrations iniciais?",
    }
  }

  // Gera próximo código numérico
  const { data: allCodes } = await admin.from("units").select("code")
  let max = 0
  for (const row of allCodes ?? []) {
    const n = parseInt(row.code, 10)
    if (!isNaN(n) && /^\d+$/.test(row.code)) max = Math.max(max, n)
  }
  const code = String(max + 1).padStart(2, "0")

  // Cria unidade
  const cnpjClean = cnpjRaw.replace(/\D/g, "")
  const { data: newUnit, error: insErr } = await admin
    .from("units")
    .insert({
      code,
      name,
      city,
      state: stateUf,
      cnpj: cnpjClean.length === 14 ? cnpjClean : null,
      active,
      brand_id: brand.id,
    })
    .select("id, code, name")
    .single()
  if (insErr || !newUnit) {
    return {
      ok: false,
      message: insErr?.message ?? "Falha ao criar unidade.",
    }
  }

  // Vincula plataformas selecionadas. A plataforma de origem (de onde
  // veio o relatório) recebe o external_store_id. As outras ficam sem ID
  // até Marcus completar manualmente em /unidades.
  const platformRows = platforms.map((p) => ({
    unit_id: newUnit.id,
    platform: p,
    active: true,
    external_store_id: p === sourcePlatform ? storeId : null,
  }))
  const { error: upErr } = await admin
    .from("unit_platforms")
    .insert(platformRows)
  if (upErr) {
    return { ok: false, message: `Falha ao vincular plataformas: ${upErr.message}` }
  }

  // Agora importa o arquivo. Carrega storeMaps COMPLETOS (todas as
  // unidades cadastradas + a recém-criada) — assim arquivos multi-loja
  // gravam tudo que conseguem mapear.
  const storeMaps = await loadAllStoreMaps(admin)
  const out = await processFile(file, storeMaps, admin, userId)

  // Pra processFile que retorna array (multi-loja), queremos o result
  // da loja RECÉM-CRIADA — não outras lojas que continuam unmapped
  // e poluiriam a resposta.
  const arr = Array.isArray(out) ? out : [out]
  const result =
    arr.find((r) => {
      if (r.summary && "storeId" in r.summary) {
        return r.summary.storeId === storeId
      }
      if (r.unmapped) return r.unmapped.storeId === storeId
      return false
    }) ??
    arr[0] ?? {
      filename: file.name,
      ok: false,
      message: "Nenhum resultado retornado.",
    }

  revalidateTag("reports", "max")
  revalidateTag("units", "max")
  revalidatePath("/importacao")
  revalidatePath("/unidades")
  revalidatePath("/")
  return { ok: result.ok, result }
}

// ─── Re-checar se a loja já foi vinculada (em outra rota/aba) ───────

export type RecheckAndImportState = {
  ok: boolean
  message?: string
  result?: ImportFileResult
}

/**
 * Quando um result vem como "unmapped" mas Marcus já vinculou a loja em
 * outra parte do sistema (ou outro arquivo do mesmo batch), este caminho
 * recarrega o storeMap fresh e re-tenta processar.
 *
 * Útil pra evitar o cenário "subi 5 arquivos, sistema viu todos como
 * unmapped porque storeMap foi carregado antes; vinculei 1 e os outros 4
 * continuam vendo como unmapped — clico Atualizar, sistema reconhece".
 */
export async function recheckAndImport(
  _prev: RecheckAndImportState,
  formData: FormData,
): Promise<RecheckAndImportState> {
  let userId: string
  try {
    ;({ userId } = await requireModulePermission("importacao", "edit"))
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Não autenticado" }
  }

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Arquivo não recebido." }
  }
  const expectedStoreId = String(formData.get("storeId") ?? "").trim()
  if (!expectedStoreId) {
    return { ok: false, message: "storeId não informado." }
  }

  const admin = createAdminClient()

  // Recarrega storeMaps FRESH
  const storeMaps = await loadAllStoreMaps(admin)
  const out = await processFile(file, storeMaps, admin, userId)

  // Multi-loja retorna array; pegamos o result que bate com o storeId esperado
  const arr = Array.isArray(out) ? out : [out]
  const matched =
    arr.find((r) => {
      if (r.summary && "storeId" in r.summary)
        return r.summary.storeId === expectedStoreId
      if (r.unmapped) return r.unmapped.storeId === expectedStoreId
      return false
    }) ?? arr[0]

  if (!matched) {
    return { ok: false, message: "Nenhum resultado retornado." }
  }

  if (matched.ok) {
    revalidateTag("reports", "max")
    revalidateTag("units", "max")
    revalidatePath("/importacao")
    revalidatePath("/unidades")
    revalidatePath("/")
  }

  return {
    ok: matched.ok,
    message: matched.ok
      ? undefined
      : `A loja ${expectedStoreId} ainda não está vinculada a nenhuma unidade.`,
    result: matched,
  }
}

// ─── Vincular unidade existente ao storeId desconhecido ─────────────

export type LinkUnitAndImportState = {
  ok: boolean
  message?: string
  result?: ImportFileResult
}

/**
 * Quando o XLSX traz storeId desconhecido mas a unidade JÁ EXISTE
 * (só faltava o ID dessa plataforma vinculado), este caminho:
 *   1. Pega a unidade escolhida
 *   2. Insere ou atualiza `unit_platforms` (platform, external_store_id)
 *   3. Reprocessa o arquivo (agora com o mapping certo)
 */
export async function linkUnitAndImport(
  _prev: LinkUnitAndImportState,
  formData: FormData,
): Promise<LinkUnitAndImportState> {
  let userId: string
  try {
    ;({ userId } = await requireModulePermission("importacao", "edit"))
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Não autenticado" }
  }
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Arquivo não recebido. Selecione de novo." }
  }
  const unitId = String(formData.get("unitId") ?? "").trim()
  const storeId = String(formData.get("storeId") ?? "").trim()
  const detectedPlatform = String(formData.get("platform") ?? "ifood").trim()
  const platform: "ifood" | "99food" | "keeta" =
    detectedPlatform === "99food"
      ? "99food"
      : detectedPlatform === "keeta"
        ? "keeta"
        : "ifood"

  if (!unitId) return { ok: false, message: "Escolhe a unidade." }
  if (!storeId) return { ok: false, message: "ID da loja não recebido." }

  const platformLabel =
    platform === "ifood" ? "iFood" : platform === "keeta" ? "Keeta" : "99 Food"
  const admin = createAdminClient()

  // Verifica se o storeId já está vinculado a OUTRA unidade nessa plataforma
  const { data: alreadyLinked } = await admin
    .from("unit_platforms")
    .select("unit_id")
    .eq("platform", platform)
    .eq("external_store_id", storeId)
    .maybeSingle()
  if (alreadyLinked && alreadyLinked.unit_id !== unitId) {
    return {
      ok: false,
      message: `Loja ${platformLabel} ${storeId} já está vinculada a outra unidade.`,
    }
  }

  // Verifica se a unidade já tem essa plataforma vinculada
  const { data: existingRow } = await admin
    .from("unit_platforms")
    .select("platform, external_store_id, active")
    .eq("unit_id", unitId)
    .eq("platform", platform)
    .maybeSingle()

  if (existingRow) {
    // Tem a plataforma mas talvez sem ID — atualiza
    if (existingRow.external_store_id && existingRow.external_store_id !== storeId) {
      return {
        ok: false,
        message: `Essa unidade já tem outro ID ${platformLabel} (${existingRow.external_store_id}). Confirma no /unidades.`,
      }
    }
    const { error } = await admin
      .from("unit_platforms")
      .update({ external_store_id: storeId, active: true })
      .eq("unit_id", unitId)
      .eq("platform", platform)
    if (error) {
      return { ok: false, message: `Falha ao atualizar vínculo: ${error.message}` }
    }
  } else {
    // Adiciona linha nova
    const { error } = await admin.from("unit_platforms").insert({
      unit_id: unitId,
      platform,
      active: true,
      external_store_id: storeId,
    })
    if (error) {
      return { ok: false, message: `Falha ao vincular: ${error.message}` }
    }
  }

  // Reprocessa o arquivo — agora o storeMap vai conhecer essa loja
  const storeMaps = await loadAllStoreMaps(admin)
  const out = await processFile(file, storeMaps, admin, userId)

  const arr = Array.isArray(out) ? out : [out]
  const result =
    arr.find((r) => {
      if (r.summary && "storeId" in r.summary) {
        return r.summary.storeId === storeId
      }
      if (r.unmapped) return r.unmapped.storeId === storeId
      return false
    }) ??
    arr[0] ?? {
      filename: file.name,
      ok: false,
      message: "Nenhum resultado retornado.",
    }

  revalidateTag("reports", "max")
  revalidateTag("units", "max")
  revalidatePath("/importacao")
  revalidatePath("/unidades")
  revalidatePath("/")
  return { ok: result.ok, result }
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Tenta extrair "Nome da unidade" e "Cidade" do nome do arquivo do iFood.
 * Padrão observado: "Churrasco no Pote - Hortolândia - 3554672 - ..."
 */
function extractFromFilename(filename: string): {
  name: string | null
  city: string | null
} {
  // Remove extensão
  const base = filename.replace(/\.[^.]+$/, "")
  // Padrão "Marca - Unidade - StoreId - resto"
  const m = base.match(/^(.+?)\s*-\s*(.+?)\s*-\s*(\d+)\s*-\s*/)
  if (m) {
    const marca = m[1].trim()
    const unidade = m[2].trim()
    return {
      name: `${marca} — ${unidade}`,
      city: unidade,
    }
  }
  return { name: null, city: null }
}

/** Extrai metadados úteis pra pre-fill da nova unidade. Avaliações
 *  é multi-loja e não usa esse path. */
function extractFromParsed(parsed: ParsedCardapio | ParsedFinanceiro): {
  cnpj: string | null
  storeName: string | null
} {
  if (parsed.reportType === "financeiro") {
    return { cnpj: parsed.storeCnpj, storeName: null }
  }
  return { cnpj: null, storeName: parsed.storeName }
}

function formatDateOnly(d: Date): string
function formatDateOnly(d: Date | null): string | null
function formatDateOnly(d: Date | null): string | null {
  if (!d) return null
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function toIso(d: Date | null): string | null {
  return d ? d.toISOString() : null
}
