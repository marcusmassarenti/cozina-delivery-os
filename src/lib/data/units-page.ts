import "server-only"

/**
 * A listagem de Unidades, PAGINADA — uma página de cada vez, filtrada no banco.
 *
 * ── POR QUE NÃO USA `getUnits()` ─────────────────────────────────────────
 * `getUnits()` é a lista completa e cacheada que quase toda tela usa, e ela faz
 * uma coisa cara que ESTA tela não aproveita: chama `getRealMonthlyForUnits`
 * pra TODAS as lojas, montando o agregado do mês. A listagem nunca leu
 * `unit.monthly` — conferido. Com 16 lojas ninguém nota; com 500 é o custo
 * dominante da abertura da tela, pago pra jogar fora.
 *
 * Aqui a pergunta é outra e menor: "as 50 lojas desta página, com o que a
 * tabela mostra". Por isso é uma consulta própria em vez de um filtro em cima
 * da lista grande.
 *
 * ── O QUE VEM DO BANCO E O QUE VEM DEPOIS ────────────────────────────────
 * A RPC `unidades_lista` (migration 0207) faz busca, filtro, ordenação,
 * contagem total e paginação — tudo num POST, porque o escopo do usuário é uma
 * lista de ids e com 500 lojas ela não caberia na URL do PostgREST.
 *
 * Depois, só pras 50 da página: as plataformas (pros logos) e a marca de loja
 * compartilhada. Duas consultas pequenas com 50 ids, não 500.
 *
 * ── POR QUE A LINHA CARREGA O CADASTRO INTEIRO ───────────────────────────
 * A tabela mostra 8 colunas, mas cada linha traz os ~25 campos do cadastro. É
 * de propósito: o "Editar" abre um diálogo com o formulário completo, e sem os
 * campos ele precisaria de uma ida ao servidor por clique. 50 linhas completas
 * dão ~45 KB — contra os 443 KB que a tela mandava com as 487 lojas.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { getAccessibleUnitIds, getCurrentHoldingId } from "@/lib/auth/permissions"
import {
  ordenarPlataformas,
  type CanalId,
  type PlatformId,
} from "@/components/platform-logo"
import type {
  FiltrosUnidades,
  LinhaUnidade,
  PaginaUnidades,
} from "@/lib/data/units-page-tipos"

// Reexportados pra quem já importa daqui não precisar saber da separação.
export * from "@/lib/data/units-page-tipos"

type LinhaRpc = {
  id: string
  code: string
  name: string
  city: string | null
  state: string | null
  cnpj: string | null
  active: boolean
  brand_id: string
  brand_name: string
  logo_url: string | null
  data_inauguracao: string | null
  data_encerramento: string | null
  razao_social: string | null
  nome_fantasia: string | null
  tipo_cozinha: string | null
  tipo_operacao: string | null
  regime_fiscal: string | null
  tipo_entrega: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cep: string | null
  telefone: string | null
  responsavel_nome: string | null
  responsavel_email: string | null
  cnae_descricao: string | null
  situacao_cadastral: string | null
  faltando: number
  ultima_venda: string | null
  total: number
}

export async function getUnitsPage(
  f: FiltrosUnidades,
): Promise<PaginaUnidades> {
  const admin = createAdminClient()
  const allowed = await getAccessibleUnitIds()

  const vazio: PaginaUnidades = {
    linhas: [],
    total: 0,
    page: 1,
    perPage: f.perPage,
    totalPaginas: 1,
    cidades: [],
  }
  // Escopo vazio é resposta legítima (franqueado sem loja), não erro.
  if (allowed !== null && allowed.length === 0) return vazio

  const perPage = f.perPage
  const page = Math.max(1, f.page)

  const { data, error } = await admin.rpc("unidades_lista", {
    p_unit_ids: allowed,
    p_q: f.q || null,
    p_city: f.city || null,
    p_platforms: f.platforms.length > 0 ? f.platforms : null,
    p_only_active: f.onlyActive,
    p_com_pendencia: f.comPendencia,
    p_sort: f.sort,
    p_dir: f.dir,
    p_limit: perPage,
    p_offset: (page - 1) * perPage,
  })
  if (error) throw new Error(`Falha ao listar unidades: ${error.message}`)

  let linhasRpc = (data ?? []) as LinhaRpc[]
  let paginaReal = page

  // Página além do fim → volta pra primeira, em vez de mostrar tela vazia.
  //
  // Acontece o tempo todo na prática: você está na página 7, marca um filtro e
  // o resultado passa a ter 2 páginas. Sem isto a tela diz "nenhuma unidade
  // bate com os filtros", que é mentira — bate, só não naquela página. A
  // segunda consulta só roda nesse caso.
  if (linhasRpc.length === 0 && page > 1) {
    const { data: d1 } = await admin.rpc("unidades_lista", {
      p_unit_ids: allowed,
      p_q: f.q || null,
      p_city: f.city || null,
      p_platforms: f.platforms.length > 0 ? f.platforms : null,
      p_only_active: f.onlyActive,
      p_com_pendencia: f.comPendencia,
      p_sort: f.sort,
      p_dir: f.dir,
      p_limit: perPage,
      p_offset: 0,
    })
    linhasRpc = (d1 ?? []) as LinhaRpc[]
    paginaReal = 1
  }

  const total = linhasRpc[0]?.total ?? 0
  const ids = linhasRpc.map((r) => r.id)

  // Plataformas e compartilhamento só das 50 da página. As cidades são do
  // escopo inteiro porque alimentam o seletor de filtro — mas é uma coluna só.
  const [plats, compartilhadas, cidades] = await Promise.all([
    ids.length > 0
      ? admin
          .from("unit_platforms")
          .select("unit_id, platform, external_store_id, data_inauguracao")
          .in("unit_id", ids)
          .eq("active", true)
      : Promise.resolve({ data: [] as never[] }),
    marcarCompartilhadas(),
    listarCidades(allowed),
  ])

  const porUnidade = new Map<
    string,
    {
      platforms: CanalId[]
      externalStoreIds: Partial<Record<PlatformId, string | null>>
      platformInauguracoes: Partial<Record<PlatformId, string | null>>
    }
  >()
  for (const row of (plats.data ?? []) as {
    unit_id: string
    platform: PlatformId
    external_store_id: string | null
    data_inauguracao: string | null
  }[]) {
    const atual = porUnidade.get(row.unit_id) ?? {
      platforms: [],
      externalStoreIds: {},
      platformInauguracoes: {},
    }
    atual.platforms.push(row.platform as CanalId)
    atual.externalStoreIds[row.platform] = row.external_store_id ?? null
    atual.platformInauguracoes[row.platform] = row.data_inauguracao ?? null
    porUnidade.set(row.unit_id, atual)
  }

  const linhas: LinhaUnidade[] = linhasRpc.map((r) => {
    const p = porUnidade.get(r.id)
    const dona = compartilhadas.get(r.id)
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      city: r.city,
      state: r.state,
      cnpj: r.cnpj,
      active: r.active,
      brandId: r.brand_id,
      brandName: r.brand_name,
      logoUrl: r.logo_url,
      // Ordem canônica (iFood, 99, Keeta, Cardápio Web) já na origem — senão a
      // mesma combinação aparece numa sequência numa linha e noutra na de
      // baixo, que era um incômodo antigo dos cards.
      platforms: ordenarPlataformas(p?.platforms ?? []),
      externalStoreIds: p?.externalStoreIds ?? {},
      platformInauguracoes: p?.platformInauguracoes ?? {},
      faltando: r.faltando,
      ultimaVenda: r.ultima_venda,
      ...(dona ? { compartilhada: { donaNome: dona } } : {}),
      dataInauguracao: r.data_inauguracao,
      dataEncerramento: r.data_encerramento,
      razaoSocial: r.razao_social,
      nomeFantasia: r.nome_fantasia,
      tipoCozinha: r.tipo_cozinha,
      tipoOperacao: r.tipo_operacao,
      regimeFiscal: r.regime_fiscal,
      tipoEntrega: r.tipo_entrega,
      logradouro: r.logradouro,
      numero: r.numero,
      complemento: r.complemento,
      bairro: r.bairro,
      cep: r.cep,
      telefone: r.telefone,
      responsavelNome: r.responsavel_nome,
      responsavelEmail: r.responsavel_email,
      cnaeDescricao: r.cnae_descricao,
      situacaoCadastral: r.situacao_cadastral,
    }
  })

  return {
    linhas,
    total,
    page: paginaReal,
    perPage,
    totalPaginas: Math.max(1, Math.ceil(total / perPage)),
    cidades,
  }
}

/**
 * Lojas emprestadas por outra empresa. Sem esta marca a linha mente por
 * omissão: vem com um código fora da sequência (ela carrega o número da rede
 * dona) e sem botão de editar, e quem olha conclui defeito em vez de permissão.
 */
async function marcarCompartilhadas(): Promise<Map<string, string>> {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return new Map()
  const { getLojasCompartilhadasPorHolding } = await import(
    "@/lib/data/lojas-compartilhadas"
  )
  const mapa = await getLojasCompartilhadasPorHolding()
  return new Map((mapa.get(holdingId) ?? []).map((l) => [l.unitId, l.donaNome]))
}

/** Cidades distintas do escopo, pro seletor de filtro. Uma coluna só. */
async function listarCidades(allowed: string[] | null): Promise<string[]> {
  const admin = createAdminClient()
  let q = admin.from("units").select("city").not("city", "is", null)
  if (allowed !== null) q = q.in("id", allowed)
  const { data } = await q
  const set = new Set(
    ((data ?? []) as { city: string | null }[])
      .map((r) => r.city)
      .filter((c): c is string => !!c),
  )
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"))
}
