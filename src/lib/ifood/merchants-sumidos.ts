import "server-only"

/**
 * Merchants que o iFood PAROU de devolver — na prática, autorização revogada.
 *
 * A varredura grava `last_seen_at` em todo merchant que a API lista. Quando o
 * lojista revoga o app no Portal do Parceiro, o merchant simplesmente some da
 * resposta: nenhum erro, nenhum evento, nenhum aviso. A linha continua na
 * nossa tabela exatamente como estava, e a única pista é o `last_seen_at`
 * parado numa varredura antiga.
 *
 * Medido em 13/ago/26: a rodada das 18:09 devolveu 67 merchants; o "Marmitex
 * Faisão Restaurante" ficou em 12:49. O cliente tinha autorizado de manhã e
 * revogado à tarde. Do nosso lado, a tela só sabia dizer "nenhum dos 2
 * merchants testados tem esse CNPJ" — uma mensagem que descreve o sintoma e
 * esconde a causa, e que faz o operador procurar erro de cadastro.
 *
 * ⚠️ POR QUE O CORTE É `max(last_seen_at)` E NÃO `now()`: se a varredura
 * falhar (token vencido, iFood fora do ar), NADA é atualizado — e comparar com
 * o relógio marcaria TODO MUNDO como revogado, transformando uma falha nossa
 * num alarme de que 65 clientes caíram. Comparando com a última vez que
 * ALGUÉM foi visto, uma varredura que não rodou simplesmente não gera aviso.
 */
import { createAdminClient } from "@/lib/supabase/admin"

/** Folga depois da última varredura antes de considerar sumido. */
const TOLERANCIA_HORAS = 2

export type MerchantSumido = {
  merchantId: string
  nome: string | null
  razaoSocial: string | null
  cnpj: string | null
  desde: string
  /** Preenchido só quando o merchant estava VINCULADO a uma loja nossa. */
  loja: { unitId: string; code: string; name: string; empresa: string } | null
}

export async function merchantsSumidos(): Promise<MerchantSumido[]> {
  const admin = createAdminClient()

  const { data: todos, error } = await admin
    .from("ifood_merchants")
    .select("id, name, corporate_name, cnpj, last_seen_at, ignorado_em")
    .order("last_seen_at", { ascending: false })
  if (error) {
    console.error("merchantsSumidos:", error.message)
    return []
  }

  const linhas = (todos ?? []) as {
    id: string
    name: string | null
    corporate_name: string | null
    cnpj: string | null
    last_seen_at: string | null
    ignorado_em: string | null
  }[]
  if (linhas.length === 0) return []

  const ultima = linhas
    .map((m) => (m.last_seen_at ? Date.parse(m.last_seen_at) : 0))
    .reduce((a, b) => Math.max(a, b), 0)
  if (!ultima) return []
  const corte = ultima - TOLERANCIA_HORAS * 60 * 60 * 1000

  const sumidos = linhas.filter(
    (m) =>
      !m.ignorado_em &&
      m.last_seen_at != null &&
      Date.parse(m.last_seen_at) < corte,
  )
  if (sumidos.length === 0) return []

  // Quais deles estavam VINCULADOS — esses são os graves: a loja sincronizava
  // e vai parar sem que ninguém peça nada.
  const { data: vinc } = await admin
    .from("unit_platforms")
    .select(
      "api_store_id, unit_id, units!inner(code, name, brands!inner(holdings!inner(name)))",
    )
    .eq("platform", "ifood")
    .in(
      "api_store_id",
      sumidos.map((m) => m.id),
    )
  const porMerchant = new Map<string, MerchantSumido["loja"]>()
  for (const v of (vinc ?? []) as unknown as {
    api_store_id: string
    unit_id: string
    units: { code: string; name: string; brands: { holdings: { name: string } } }
  }[]) {
    porMerchant.set(v.api_store_id, {
      unitId: v.unit_id,
      code: v.units.code,
      name: v.units.name,
      empresa: v.units.brands.holdings.name,
    })
  }

  return sumidos.map((m) => ({
    merchantId: m.id,
    nome: m.name,
    razaoSocial: m.corporate_name,
    cnpj: m.cnpj,
    desde: m.last_seen_at!,
    loja: porMerchant.get(m.id) ?? null,
  }))
}

/**
 * O merchant deste CNPJ existiu e sumiu? Serve pra explicar a falha do
 * vínculo com a CAUSA em vez do sintoma.
 */
export function sumidoPorCnpj(
  lista: MerchantSumido[],
  cnpj: string,
): MerchantSumido | null {
  const so = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "")
  const alvo = so(cnpj)
  if (alvo.length !== 14) return null
  return lista.find((m) => so(m.cnpj) === alvo) ?? null
}
