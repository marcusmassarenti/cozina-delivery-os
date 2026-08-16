/**
 * Tipos e constantes da listagem de Unidades — o que o CLIENTE também usa.
 *
 * ⚠️ Este arquivo NÃO pode ser `server-only`, e é por isso que ele existe
 * separado de `units-page.ts`. A tabela é um Client Component e precisa de
 * `POR_PAGINA_OPCOES` (um valor, não um tipo) pra desenhar o seletor. Importar
 * isso do módulo de dados quebrava o build inteiro: ele puxa
 * `@/lib/auth/permissions` → `next/headers`, que só existe no servidor.
 *
 * A regra prática: tipo atravessa a fronteira de graça (some na compilação),
 * valor não. Se o cliente precisa de um valor que mora perto do banco, o valor
 * muda de casa — não o `import`.
 */
import type { CanalId } from "@/components/platform-logo"

export const POR_PAGINA_PADRAO = 50
/** Opções do seletor. Teto de 100: acima disso é a rolagem que atrapalha. */
export const POR_PAGINA_OPCOES = [25, 50, 100] as const

export type OrdemUnidades = "code" | "name" | "city" | "faltando"

export type FiltrosUnidades = {
  page: number
  perPage: number
  q: string
  city: string
  platforms: CanalId[]
  onlyActive: boolean
  comPendencia: boolean
  sort: OrdemUnidades
  dir: "asc" | "desc"
}

export type LinhaUnidade = {
  id: string
  code: string
  name: string
  city: string | null
  state: string | null
  cnpj: string | null
  active: boolean
  brandId: string
  logoUrl: string | null
  platforms: CanalId[]
  externalStoreIds: Partial<Record<CanalId, string | null>>
  platformInauguracoes: Partial<Record<CanalId, string | null>>
  /** Quantos campos do cadastro faltam (0 = completo). */
  faltando: number
  compartilhada?: { donaNome: string }
  dataInauguracao: string | null
  dataEncerramento: string | null
  razaoSocial: string | null
  nomeFantasia: string | null
  tipoCozinha: string | null
  tipoOperacao: string | null
  regimeFiscal: string | null
  tipoEntrega: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cep: string | null
  telefone: string | null
  responsavelNome: string | null
  responsavelEmail: string | null
  cnaeDescricao: string | null
  situacaoCadastral: string | null
}

export type PaginaUnidades = {
  linhas: LinhaUnidade[]
  total: number
  page: number
  perPage: number
  totalPaginas: number
  /** Cidades pro filtro — de TODAS as lojas do escopo, não só da página. */
  cidades: string[]
}

/** Lê os filtros da URL — a URL é a fonte da verdade, pra o link ser colável. */
export function filtrosDaUrl(
  sp: Record<string, string | string[] | undefined>,
): FiltrosUnidades {
  const um = (k: string): string => {
    const v = sp[k]
    return (Array.isArray(v) ? v[0] : v) ?? ""
  }
  const perPage = Number(um("por")) || POR_PAGINA_PADRAO
  const sort = um("ord")
  const dir = um("dir")
  return {
    page: Math.max(1, Number(um("p")) || 1),
    // Trava nas opções conhecidas: `?por=100000` viraria a tela inteira num
    // pedido só, que é exatamente o que a paginação existe pra evitar.
    perPage: (POR_PAGINA_OPCOES as readonly number[]).includes(perPage)
      ? perPage
      : POR_PAGINA_PADRAO,
    q: um("q").slice(0, 80),
    city: um("cidade"),
    platforms: um("plat").split(",").filter(Boolean) as CanalId[],
    // ⚠️ LIGADO POR PADRÃO (decisão do Marcus, 16/08/26). A tela é de operação
    // e loja fechada só atrapalha a leitura. Por isso a leitura é invertida:
    // parâmetro AUSENTE = ligado; `ativas=0` é o único jeito de desligar.
    onlyActive: um("ativas") !== "0",
    comPendencia: um("pend") === "1",
    sort: (["code", "name", "city", "faltando"] as const).includes(
      sort as OrdemUnidades,
    )
      ? (sort as OrdemUnidades)
      : "code",
    dir: dir === "desc" ? "desc" : "asc",
  }
}
