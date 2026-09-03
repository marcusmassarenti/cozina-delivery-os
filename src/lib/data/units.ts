import "server-only"

import { unstable_cache } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  getAccessibleUnitIds,
  getCurrentHoldingId,
  isSuperadmin,
} from "@/lib/auth/roles"
import { emptyMonthly, type UnitMonthly } from "@/lib/mock-monthly"
import { getRealMonthlyForUnits } from "@/lib/data/lancamentos"
import { currentPeriod } from "@/lib/period"
import {
  ordenarPlataformas,
  PLATAFORMAS,
  rotuloPlataforma,
  type CanalId,
  type PlatformId,
} from "@/components/platform-logo"

export type Unit = {
  id: string
  code: string
  name: string
  city: string | null
  state: string | null
  cnpj: string | null
  /** Cadastro rico: Receita + perfil da loja. Todos opcionais no tipo porque
   *  as 18 unidades antigas ainda não têm — o formulário é que cobra. */
  razao_social?: string | null
  nome_fantasia?: string | null
  tipo_cozinha?: string | null
  tipo_operacao?: string | null
  regime_fiscal?: string | null
  tipo_entrega?: string | null
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cep?: string | null
  telefone?: string | null
  responsavel_nome?: string | null
  responsavel_email?: string | null
  cnae_descricao?: string | null
  situacao_cadastral?: string | null
  active: boolean
  brand_id: string
  data_inauguracao: string | null // "YYYY-MM-DD"
  data_encerramento: string | null
  /** Logo da loja (white-label por unidade). null = usa o logo da empresa. */
  logoUrl: string | null
  platforms: CanalId[]
  /**
   * Loja de OUTRA empresa, compartilhada com você só pra acompanhar.
   *
   * Sem esta marca a tela mentia por omissão: a loja aparecia igual às suas,
   * com um código fora da sua sequência (ela carrega o número da rede dona) e
   * sem botão de editar. Quem olhava concluía defeito, não permissão.
   */
  compartilhada?: { donaNome: string }
  /** Por plataforma, o ID da loja no sistema externo (ex.: iFood 260777). */
  externalStoreIds: Partial<Record<PlatformId, string | null>>
  /** Por plataforma, a data de inauguração na plataforma (override da unidade). */
  platformInauguracoes: Partial<Record<PlatformId, string | null>>
  monthly: UnitMonthly
}

type DbUnit = {
  id: string
  code: string
  name: string
  city: string | null
  state: string | null
  cnpj: string | null
  /** Cadastro rico: Receita + perfil da loja. Todos opcionais no tipo porque
   *  as 18 unidades antigas ainda não têm — o formulário é que cobra. */
  razao_social?: string | null
  nome_fantasia?: string | null
  tipo_cozinha?: string | null
  tipo_operacao?: string | null
  regime_fiscal?: string | null
  tipo_entrega?: string | null
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cep?: string | null
  telefone?: string | null
  responsavel_nome?: string | null
  responsavel_email?: string | null
  cnae_descricao?: string | null
  situacao_cadastral?: string | null
  active: boolean
  brand_id: string
  data_inauguracao: string | null
  data_encerramento: string | null
}

function attach(
  u: DbUnit,
  platforms: CanalId[],
  externalStoreIds: Partial<Record<PlatformId, string | null>>,
  platformInauguracoes: Partial<Record<PlatformId, string | null>>,
  monthly: UnitMonthly,
  logoUrl: string | null = null,
): Unit {
  return { ...u, logoUrl, platforms, externalStoreIds, platformInauguracoes, monthly }
}

// Mês corrente SEMPRE no fuso de Brasília (não o UTC do servidor Vercel), pra
// não virar o mês cedo demais (~21h BRT em diante) e divergir do PeriodSelector.
function currentYearMonth(): { year: number; month: number } {
  return currentPeriod()
}

/**
 * Lista de unidades + agregado mensal. É chamada em quase toda tela, então
 * cacheamos (TTL 60s + tags). Invalida na hora via revalidateTag("units")
 * (CRUD de unidade) e revalidateTag("reports") (import / custos). No pior
 * caso de cache não invalidado, o dado fica no máx. 60s velho.
 */
async function getUnitsUncached(): Promise<Unit[]> {
  const supabase = createAdminClient()
  const [unitsRes, platformsRes] = await Promise.all([
    supabase
      .from("units")
      .select(
        "id, code, name, city, state, cnpj, active, brand_id, data_inauguracao, data_encerramento, razao_social, nome_fantasia, tipo_cozinha, tipo_operacao, regime_fiscal, tipo_entrega, logradouro, numero, complemento, bairro, cep, telefone, responsavel_nome, responsavel_email, cnae_descricao, situacao_cadastral",
      )
      .order("code"),
    supabase
      .from("unit_platforms")
      .select("unit_id, platform, external_store_id, data_inauguracao")
      .eq("active", true),
  ])
  if (unitsRes.error)
    throw new Error(`Falha ao buscar unidades: ${unitsRes.error.message}`)
  const platformsByUnit = new Map<string, CanalId[]>()
  const externalIdsByUnit = new Map<
    string,
    Partial<Record<PlatformId, string | null>>
  >()
  const inaugByUnit = new Map<
    string,
    Partial<Record<PlatformId, string | null>>
  >()
  for (const row of platformsRes.data ?? []) {
    const platform = row.platform as PlatformId
    const arr = platformsByUnit.get(row.unit_id) ?? []
    arr.push(platform)
    platformsByUnit.set(row.unit_id, arr)
    const ids = externalIdsByUnit.get(row.unit_id) ?? {}
    ids[platform] = row.external_store_id ?? null
    externalIdsByUnit.set(row.unit_id, ids)
    const inaug = inaugByUnit.get(row.unit_id) ?? {}
    inaug[platform] =
      (row as { data_inauguracao: string | null }).data_inauguracao ?? null
    inaugByUnit.set(row.unit_id, inaug)
  }
  const units = unitsRes.data ?? []
  const unitIds = units.map((u) => u.id)
  const { year, month } = currentYearMonth()
  const monthlyByUnit = await getRealMonthlyForUnits(unitIds, year, month)

  // Logo por loja (best-effort: a coluna pode ainda não existir — pré-migration
  // 0062. Sem ela, cai no logo da empresa / inicial).
  const logoByUnit = new Map<string, string | null>()
  const { data: logos, error: logoErr } = await supabase
    .from("units")
    .select("id, logo_url")
  if (!logoErr) {
    for (const r of logos ?? [])
      logoByUnit.set(r.id, (r as { logo_url: string | null }).logo_url ?? null)
  }

  return units.map((u) =>
    attach(
      u,
      // Ordem canônica JÁ NA ORIGEM (iFood, 99, Keeta, Cardápio Web). Sem
      // isto a lista sai na ordem de inserção de `unit_platforms`, que varia
      // de loja pra loja — a mesma combinação de plataformas aparecia numa
      // sequência em um card e noutra no card ao lado. Ordenar aqui conserta
      // todo consumidor de `unit.platforms` de uma vez.
      ordenarPlataformas(platformsByUnit.get(u.id) ?? []),
      externalIdsByUnit.get(u.id) ?? {},
      inaugByUnit.get(u.id) ?? {},
      monthlyByUnit.get(u.id) ?? emptyMonthly,
      logoByUnit.get(u.id) ?? null,
    ),
  )
}

export const getUnits = unstable_cache(getUnitsUncached, ["units-monthly-v2"], {
  revalidate: 60,
  tags: ["units", "reports"],
})

/**
 * Unidades VISÍVEIS pro usuário logado (escopo de papel).
 *
 *  - admin / gerente → todas (getAccessibleUnitIds devolve null)
 *  - franqueado      → só as units vinculadas a ele
 *
 * NÃO é cacheado globalmente (o filtro é por-usuário); reaproveita o cache
 * global de getUnits() e só cruza com os IDs acessíveis. Use nas PÁGINAS no
 * lugar de getUnits(); as funções de rede então recebem só os unitIds certos.
 */
export async function getVisibleUnits(): Promise<Unit[]> {
  const all = await getUnits()
  const allowed = await getAccessibleUnitIds()
  const marcar = async (lista: Unit[]) => {
    // Marca as emprestadas. A pergunta "de quem é esta loja?" só tem resposta
    // aqui, onde a lista já foi montada — cada tela responderia sozinha e
    // responderia diferente.
    const holdingId = await getCurrentHoldingId()
    if (!holdingId) return lista
    const { getLojasCompartilhadasPorHolding } = await import(
      "@/lib/data/lojas-compartilhadas"
    )
    const mapa = await getLojasCompartilhadasPorHolding()
    const minhas = mapa.get(holdingId) ?? []
    if (minhas.length === 0) return lista
    const porId = new Map(minhas.map((l) => [l.unitId, l.donaNome]))
    return lista.map((u) => {
      const dona = porId.get(u.id)
      return dona ? { ...u, compartilhada: { donaNome: dona } } : u
    })
  }
  if (allowed === null) return marcar(all)
  const set = new Set(allowed)
  return marcar(all.filter((u) => set.has(u.id)))
}

/**
 * IDs das lojas de uma HOLDING (marcas → unidades). Usado pra escopar a API
 * pública /api/v1 aos dados da empresa dona da chave. Devolve [] se a holding
 * não tem loja (fail-closed: a API então não retorna nada de ninguém).
 */
export async function getHoldingUnitIds(holdingId: string): Promise<string[]> {
  const supabase = createAdminClient()
  const { data: brands } = await supabase
    .from("brands")
    .select("id")
    .eq("holding_id", holdingId)
  const brandIds = (brands ?? []).map((b) => b.id as string)
  if (brandIds.length === 0) return []
  const { data: units } = await supabase
    .from("units")
    .select("id")
    .in("brand_id", brandIds)
  return (units ?? []).map((u) => u.id as string)
}

export async function getUnitByCode(code: string): Promise<Unit | null> {
  const supabase = createAdminClient()

  // Multi-tenant: `code` é único só por marca, então pode repetir entre
  // empresas. Escopa às lojas acessíveis (super-admin = null = qualquer uma) e
  // usa fetch seguro (limit 1) pra não quebrar com código repetido.
  const allowed = await getAccessibleUnitIds()
  if (allowed !== null && allowed.length === 0) return null

  let q = supabase
    .from("units")
    .select(
      "id, code, name, city, state, cnpj, active, brand_id, data_inauguracao, data_encerramento, razao_social, nome_fantasia, tipo_cozinha, tipo_operacao, regime_fiscal, tipo_entrega, logradouro, numero, complemento, bairro, cep, telefone, responsavel_nome, responsavel_email, cnae_descricao, situacao_cadastral",
    )
    .eq("code", code)
    .order("id")
    .limit(1)
  if (allowed !== null) q = q.in("id", allowed)

  const { data: rows, error } = await q
  if (error) throw new Error(`Falha ao buscar unidade ${code}: ${error.message}`)
  const data = rows?.[0]
  if (!data) return null
  const platformsDetails = await getUnitPlatformDetails(data.id)
  const platforms = ordenarPlataformas(platformsDetails.map((p) => p.platform))
  const externalStoreIds: Partial<Record<PlatformId, string | null>> = {}
  const platformInauguracoes: Partial<Record<PlatformId, string | null>> = {}
  for (const p of platformsDetails) {
    externalStoreIds[p.platform] = p.externalStoreId
    platformInauguracoes[p.platform] = p.dataInauguracao
  }
  const { year, month } = currentYearMonth()
  const monthlyByUnit = await getRealMonthlyForUnits([data.id], year, month)
  // Logo da loja (best-effort — coluna pode não existir antes da migration 0062).
  let logoUrl: string | null = null
  const { data: logoRow, error: logoErr } = await supabase
    .from("units")
    .select("logo_url")
    .eq("id", data.id)
    .maybeSingle()
  if (!logoErr)
    logoUrl = (logoRow as { logo_url: string | null } | null)?.logo_url ?? null
  const unidade = attach(
    data,
    platforms,
    externalStoreIds,
    platformInauguracoes,
    monthlyByUnit.get(data.id) ?? emptyMonthly,
    logoUrl,
  )

  // A marca de "emprestada" também aqui: a tela da unidade não passa por
  // getVisibleUnits, e sem isto o selo aparecia na LISTA e sumia ao abrir a
  // loja — bem onde a pessoa procura o motivo de não ter botão de editar.
  const holdingId = await getCurrentHoldingId()
  if (holdingId) {
    const { getLojasCompartilhadasPorHolding } = await import(
      "@/lib/data/lojas-compartilhadas"
    )
    const mapa = await getLojasCompartilhadasPorHolding()
    const dona = (mapa.get(holdingId) ?? []).find((l) => l.unitId === unidade.id)
    if (dona) return { ...unidade, compartilhada: { donaNome: dona.donaNome } }
  }
  return unidade
}

export async function getUnitPlatformDetails(
  unitId: string,
): Promise<
  Array<{
    platform: PlatformId
    externalStoreId: string | null
    dataInauguracao: string | null
  }>
> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("unit_platforms")
    .select("platform, external_store_id, data_inauguracao")
    .eq("unit_id", unitId)
    .eq("active", true)
  if (error) {
    console.error("getUnitPlatformDetails:", error.message)
    return []
  }
  return (data ?? []).map((r) => ({
    platform: r.platform as PlatformId,
    externalStoreId: r.external_store_id ?? null,
    dataInauguracao:
      (r as { data_inauguracao: string | null }).data_inauguracao ?? null,
  }))
}

export async function getUnitPlatforms(
  unitId: string,
): Promise<PlatformId[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("unit_platforms")
    .select("platform")
    .eq("unit_id", unitId)
    .eq("active", true)
  if (error) {
    console.error("getUnitPlatforms:", error.message)
    return []
  }
  return (data ?? []).map((r) => r.platform as PlatformId)
}

/**
 * Estado dos DOIS apps do iFood de uma loja — Financeiro e Avaliações.
 *
 * O iFood autoriza cada app SEPARADAMENTE, e Avaliações é POR LOJA, não por
 * CNPJ (provado na Parmegiana Crocante, 03/09/26: mesmo CNPJ das irmãs já
 * ativas, mas a API de avaliações dela dava 403). A tela dizia "conectado"
 * olhando só o vínculo — Marcus pegou: "por que você disse que todas estavam
 * conectadas e essa faltava?".
 *
 * A verdade mora nos carimbos que os crons mantêm contra a API: o financeiro
 * confirma quando o extrato desce, o review-sync limpa `review_enabled_at`
 * no 403 e reacende no 200. Vínculo só (api_store_id) NÃO é conexão completa.
 */
export async function getIfoodAppsStatus(
  unitId: string,
): Promise<{ vinculado: boolean; financeiro: boolean; avaliacoes: boolean } | null> {
  const { data } = await createAdminClient()
    .from("unit_platforms")
    .select("api_store_id, fin_enabled_at, review_enabled_at")
    .eq("unit_id", unitId)
    .eq("platform", "ifood")
    .eq("active", true)
    .maybeSingle()
  if (!data) return null
  return {
    vinculado: data.api_store_id != null,
    financeiro: data.fin_enabled_at != null,
    avaliacoes: data.review_enabled_at != null,
  }
}

export async function getDefaultBrand(): Promise<{ id: string; name: string }> {
  const supabase = createAdminClient()

  // Multi-tenant: a marca padrão é a 1ª marca da HOLDING do usuário logado —
  // assim um admin de cliente cria loja na empresa dele, não na Cozina.
  const holdingId = await getCurrentHoldingId()
  if (holdingId) {
    const { data } = await supabase
      .from("brands")
      .select("id, name")
      .eq("holding_id", holdingId)
      .order("created_at")
      .limit(1)
      .maybeSingle()
    if (data) return data
  }

  // Fallback (compat): marca da Cozina.
  const { data, error } = await supabase
    .from("brands")
    .select("id, name")
    .eq("slug", "churrasco-no-pote")
    .maybeSingle()
  if (error || !data)
    throw new Error("Nenhuma marca encontrada pra esta empresa.")
  return data
}

/**
 * Liga o "Sincronizar" via API (iFood/99) pro tenant atual. False = só
 * importação manual de relatório (padrão do SaaS até habilitarmos a API).
 */
/**
 * Quais plataformas têm pelo menos 1 loja VINCULADA à API no escopo do
 * usuário (iFood = unit_platforms.api_store_id; 99 = ninefood_store_links).
 * Decide quais botões "Sincronizar" aparecem no dashboard — regra do Marcus:
 * o botão só aparece quando existe vínculo de verdade.
 */
export async function getApiSyncVinculos(): Promise<{
  ifood: boolean
  ninefood: boolean
}> {
  const allowed = await getAccessibleUnitIds()
  if (allowed !== null && allowed.length === 0)
    return { ifood: false, ninefood: false }
  const admin = createAdminClient()
  let qIf = admin
    .from("unit_platforms")
    .select("unit_id", { count: "exact", head: true })
    .eq("platform", "ifood")
    .eq("active", true)
    .not("api_store_id", "is", null)
  let q99 = admin
    .from("ninefood_store_links")
    .select("unit_id", { count: "exact", head: true })
    .eq("active", true)
  if (allowed !== null) {
    qIf = qIf.in("unit_id", allowed)
    q99 = q99.in("unit_id", allowed)
  }
  const [rIf, r99] = await Promise.all([qIf, q99])
  return { ifood: (rIf.count ?? 0) > 0, ninefood: (r99.count ?? 0) > 0 }
}

/**
 * Solicitações de conexão iFood aguardando ação do admin da plataforma
 * (autoatendimento dos clientes: eles clicam "Pedir autorização" no cadastro).
 * Só o superadmin resolve — usado pelo aviso no topo do Dashboard.
 * Conta as em `pendente` (nem foram enviadas ao Portal ainda) — as em
 * `solicitada` já estão em andamento e esperam o cliente aprovar.
 */
export async function getSolicitacoesIfoodPendentes(): Promise<{
  total: number
  primeira: { holding: string; loja: string | null } | null
}> {
  if (!(await isSuperadmin())) return { total: 0, primeira: null }
  // ⚠️ "Ver como o cliente" NÃO desliga o isSuperadmin — e este aviso é da
  // PLATAFORMA (pendências de todos os clientes). Sem este guard, o Marcus
  // viu "Grupo Le Brunch" estampado dentro da visão do Churrasco Royal
  // (01/09/26). A pergunta certa não é "sou superadmin?", é "estou agindo
  // como a plataforma AGORA?" — mesma lição do aviso do cliente, invertida.
  const { getVerComoHoldingId } = await import("@/lib/auth/permissions")
  if (await getVerComoHoldingId()) return { total: 0, primeira: null }
  const admin = createAdminClient()
  const { data, count } = await admin
    .from("ifood_activation_requests")
    .select("cnpj, holdings(name), units(code, name)", { count: "exact" })
    .eq("status", "pendente")
    .order("created_at", { ascending: false })
  const first = (data ?? [])[0] as unknown as
    | { holdings: { name: string } | null; units: { code: string; name: string } | null }
    | undefined
  return {
    total: count ?? 0,
    primeira: first
      ? {
          holding: first.holdings?.name ?? "cliente",
          loja: first.units ? `${first.units.code} · ${first.units.name}` : null,
        }
      : null,
  }
}

export async function isApiSyncEnabled(): Promise<boolean> {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return false
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("holdings")
    .select("api_sync_enabled")
    .eq("id", holdingId)
    .maybeSingle()
  return Boolean((data as { api_sync_enabled?: boolean } | null)?.api_sync_enabled)
}

/**
 * União das plataformas HABILITADAS (unit_platforms.active) nas unidades dadas
 * (ou todas). Ordem canônica ifood → 99 → keeta. Usado pra só mostrar no
 * dashboard/cobertura as plataformas que o tenant realmente usa.
 */
export async function getTenantPlatforms(
  unitIds?: string[],
): Promise<PlatformId[]> {
  const supabase = createAdminClient()
  let q = supabase
    .from("unit_platforms")
    .select("platform")
    .eq("active", true)
  if (unitIds) {
    if (unitIds.length === 0) return []
    q = q.in("unit_id", unitIds)
  }
  const { data } = await q
  const set = new Set<string>()
  for (const r of data ?? []) set.add((r as { platform: string }).platform)
  return PLATAFORMAS.filter((p) => set.has(p))
}

//-------- Agregados ---------------------------------------------

export function networkTotalsFromUnits(units: Unit[]) {
  const active = units.filter((u) => u.active)
  const sum = (sel: (u: Unit) => number) =>
    active.reduce((acc, u) => acc + sel(u), 0)

  const pedidos = sum((u) => u.monthly.pedidos)
  const faturamentoBruto = sum((u) => u.monthly.faturamentoBruto)
  const faturamentoLiquido = sum((u) => u.monthly.faturamentoLiquido)
  const totalLiquido = sum((u) => u.monthly.totalLiquido)
  const mediaTicket = pedidos > 0 ? faturamentoBruto / pedidos : 0
  const mediaDia = Math.round(pedidos / 30)
  const taxaRepasse =
    faturamentoBruto > 0 ? (faturamentoLiquido / faturamentoBruto) * 100 : 0

  return {
    pedidos,
    mediaDia,
    faturamentoBruto,
    faturamentoLiquido,
    totalLiquido,
    mediaTicket,
    taxaRepasse,
  }
}

export function platformTotalsFromUnits(units: Unit[]) {
  return PLATAFORMAS.map((id) => {
    const name = rotuloPlataforma(id)
    const bruto = units
      .filter((u) => u.active)
      .reduce((acc, u) => {
        const p = u.monthly.platforms.find((p) => p.id === id)
        return acc + (p?.bruto ?? 0)
      }, 0)
    const liquido = units
      .filter((u) => u.active)
      .reduce((acc, u) => {
        const p = u.monthly.platforms.find((p) => p.id === id)
        return acc + (p?.liquido ?? 0)
      }, 0)
    const pctLoja = bruto > 0 ? (liquido / bruto) * 100 : 0
    return { id, name, bruto, liquido, pctLoja }
  })
}
