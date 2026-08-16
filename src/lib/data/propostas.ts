import "server-only"

/**
 * Propostas comerciais: montagem a partir do CADASTRO e persistência.
 *
 * A regra que organiza este arquivo: **o cadastro é a fonte enquanto a proposta
 * é rascunho; depois que ela é gerada, o retrato manda.** Por isso
 * `montarDoCadastro` só é chamada na criação — reaplicá-la numa proposta
 * assinada reescreveria um documento com valor jurídico.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import {
  PLANOS_META,
  getDefaultPlan,
  precoDoPlano,
  type PlanId,
} from "@/lib/data/assinatura"

export type StatusProposta =
  | "rascunho"
  | "enviada"
  | "assinada"
  | "recusada"
  | "cancelada"

/** O retrato do documento. Tudo que a proposta imprime sai daqui. */
export type DadosProposta = {
  // Cliente
  razaoSocial: string
  cnpj: string
  contatoNome: string
  contatoEmail: string
  contatoTelefone: string
  endereco: string
  // Comercial
  plano: PlanId
  planoLabel: string
  lojas: number
  precoPrimeira: number
  precoAdicional: number
  descontoMensal: number
  totalMensal: number
  // Condições
  vencimentoDia: number
  validadeAte: string
  setup: string
  treinamento: string
  consultorNome: string
  consultorEmail: string
  observacoes: string
  /**
   * Quem recebe boleto e nota fiscal — separado do contato comercial.
   *
   * A proposta da Mercos pede os dois, e o motivo é prático: quem assina é o
   * dono, quem paga é o financeiro. Mandar o boleto pro e-mail de quem assinou
   * é como uma cobrança some por três semanas.
   */
  contatoBoletoNome: string
  contatoBoletoEmail: string
  contatoBoletoTelefone: string
  contatoNfNome: string
  contatoNfEmail: string
  contatoNfTelefone: string
  /** Primeira cobrança (YYYY-MM-DD). Vazio = na contratação. */
  inicioCobranca: string
}

export type Proposta = {
  id: string
  numero: string
  holdingId: string
  holdingNome: string
  status: StatusProposta
  dados: DadosProposta
  assinaturaUrl: string | null
  enviadaEm: string | null
  assinadaEm: string | null
  criadaEm: string
}

function fmtEndereco(h: Record<string, unknown>): string {
  const p = [
    [h.nf_logradouro, h.nf_numero].filter(Boolean).join(", "),
    h.nf_complemento,
    h.nf_bairro,
    [h.nf_cidade, h.nf_uf].filter(Boolean).join("/"),
    h.nf_cep,
  ]
  return p.filter(Boolean).join(" · ")
}

function emDias(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Monta o retrato inicial a partir do que o cadastro já sabe.
 *
 * ⚠️ Preço: usa `monthly_fee` quando o cliente tem valor negociado (é o que
 * ele REALMENTE paga hoje) e cai na tabela de preços só quando não há. Ignorar
 * isso geraria proposta com preço de tabela para quem já tem desconto — e o
 * cliente descobre isso na hora de assinar.
 */
export async function montarDoCadastro(
  holdingId: string,
): Promise<{ nome: string; dados: DadosProposta } | null> {
  const admin = createAdminClient()

  // ⚠️ `select` em UMA string literal, sem concatenar: o client tipado do
  // Supabase lê a lista de colunas em tempo de compilação, e uma expressão
  // `"a," + "b"` faz ele desistir e devolver GenericStringError em todo campo.
  const { data: hRaw } = await admin
    .from("holdings")
    .select(
      "id, name, razao_social, doc_cpf_cnpj, plan_tier, monthly_fee, due_date, nf_logradouro, nf_numero, nf_complemento, nf_bairro, nf_cidade, nf_uf, nf_cep, nf_telefone, nf_email",
    )
    .eq("id", holdingId)
    .maybeSingle()
  const h = hRaw as Record<string, unknown> | null
  if (!h) return null

  // Lojas ATIVAS — é o que a cobrança conta, então é o que a proposta mostra.
  const { data: marcas } = await admin
    .from("brands")
    .select("id")
    .eq("holding_id", holdingId)
  const brandIds = (marcas ?? []).map((b) => b.id as string)
  let lojas = 0
  if (brandIds.length > 0) {
    const { count } = await admin
      .from("units")
      .select("id", { count: "exact", head: true })
      .in("brand_id", brandIds)
      .eq("active", true)
    lojas = count ?? 0
  }

  const plano = ((h.plan_tier as string) ?? "essencial") as PlanId
  const precos = await getDefaultPlan()
  const tabela = precos[plano] ?? precos.essencial
  const calculado = precoDoPlano(precos, plano, Math.max(lojas, 1))
  const negociado = h.monthly_fee != null ? Number(h.monthly_fee) : null
  const total = negociado ?? calculado

  return {
    nome: (h.name as string) ?? "—",
    dados: {
      razaoSocial: (h.razao_social as string) || (h.name as string) || "",
      cnpj: (h.doc_cpf_cnpj as string) ?? "",
      contatoNome: "",
      contatoEmail: (h.nf_email as string) ?? "",
      contatoTelefone: (h.nf_telefone as string) ?? "",
      endereco: fmtEndereco(h as Record<string, unknown>),
      plano,
      planoLabel: PLANOS_META[plano]?.label ?? "Essencial",
      lojas: Math.max(lojas, 1),
      precoPrimeira: tabela.first,
      precoAdicional: tabela.add,
      // O desconto é o que explica a diferença entre a tabela e o negociado.
      // Mostrar como linha evita a pergunta "por que o total não bate?".
      descontoMensal: Math.max(0, Math.round((calculado - total) * 100) / 100),
      totalMensal: Math.round(total * 100) / 100,
      vencimentoDia: h.due_date
        ? new Date(h.due_date as string).getUTCDate()
        : 10,
      validadeAte: emDias(15),
      setup: "Incluso",
      treinamento: "Incluso",
      consultorNome: "",
      consultorEmail: "",
      observacoes: "",
      // Já vem com o contato comercial: na maioria dos clientes pequenos é a
      // mesma pessoa, e pré-preencher poupa três campos. Quem tem financeiro
      // separado troca na tela.
      contatoBoletoNome: (h.nf_email as string) ? "" : "",
      contatoBoletoEmail: (h.nf_email as string) ?? "",
      contatoBoletoTelefone: (h.nf_telefone as string) ?? "",
      contatoNfNome: "",
      contatoNfEmail: (h.nf_email as string) ?? "",
      contatoNfTelefone: (h.nf_telefone as string) ?? "",
      inicioCobranca: "",
    },
  }
}

/** Número legível e sequencial por ano: 2026-0001. */
async function proximoNumero(): Promise<string> {
  const ano = new Date().getFullYear()
  const admin = createAdminClient()
  const { data } = await admin
    .from("propostas")
    .select("numero")
    .like("numero", `${ano}-%`)
    .order("numero", { ascending: false })
    .limit(1)
  const ultimo = (data ?? [])[0]?.numero as string | undefined
  const n = ultimo ? Number(ultimo.split("-")[1]) + 1 : 1
  return `${ano}-${String(n).padStart(4, "0")}`
}

export async function criarProposta(
  holdingId: string,
  userId: string | null,
): Promise<{ id: string } | { erro: string }> {
  const base = await montarDoCadastro(holdingId)
  if (!base) return { erro: "Cliente não encontrado." }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("propostas")
    .insert({
      numero: await proximoNumero(),
      holding_id: holdingId,
      dados: base.dados,
      criada_por: userId,
    })
    .select("id")
    .single()

  if (error) return { erro: error.message }
  return { id: data.id as string }
}

export async function listarPropostas(): Promise<Proposta[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("propostas")
    .select(
      "id, numero, holding_id, status, dados, assinatura_url, enviada_em, assinada_em, created_at, holdings(name)",
    )
    .order("created_at", { ascending: false })
    .limit(200)

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((p) => ({
    id: p.id as string,
    numero: p.numero as string,
    holdingId: p.holding_id as string,
    holdingNome:
      ((p.holdings as { name?: string } | null)?.name as string) ?? "—",
    status: p.status as StatusProposta,
    dados: p.dados as DadosProposta,
    assinaturaUrl: (p.assinatura_url as string | null) ?? null,
    enviadaEm: (p.enviada_em as string | null) ?? null,
    assinadaEm: (p.assinada_em as string | null) ?? null,
    criadaEm: p.created_at as string,
  }))
}

export async function getProposta(id: string): Promise<Proposta | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("propostas")
    .select(
      "id, numero, holding_id, status, dados, assinatura_url, enviada_em, assinada_em, created_at, holdings(name)",
    )
    .eq("id", id)
    .maybeSingle()
  if (!data) return null

  const p = data as unknown as Record<string, unknown>
  return {
    id: p.id as string,
    numero: p.numero as string,
    holdingId: p.holding_id as string,
    holdingNome: (p.holdings as { name?: string } | null)?.name ?? "—",
    status: p.status as StatusProposta,
    dados: p.dados as DadosProposta,
    assinaturaUrl: (p.assinatura_url as string | null) ?? null,
    enviadaEm: (p.enviada_em as string | null) ?? null,
    assinadaEm: (p.assinada_em as string | null) ?? null,
    criadaEm: p.created_at as string,
  }
}

/** Clientes disponíveis pra abrir proposta. */
export async function listarClientes(): Promise<
  { id: string; nome: string }[]
> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("holdings")
    .select("id, name")
    .order("name")
  return ((data ?? []) as { id: string; name: string }[]).map((h) => ({
    id: h.id,
    nome: h.name,
  }))
}
