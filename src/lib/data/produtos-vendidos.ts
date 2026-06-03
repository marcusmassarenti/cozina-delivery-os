import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export type ProdutoPreco = {
  id: string
  codigo: string
  descricao: string
  categoria: string
  preco: number
  considerar: boolean
}

export type VinagreteLinha = {
  codigo: string
  descricao: string
  categoria: string
  quantidade: number
  preco: number | null // null = código sem preço cadastrado
  considerar: boolean
  soma: number
  semPreco: boolean
}

export type VinagreteRef = {
  periodoInicio: string
  periodoFim: string
  linhas: VinagreteLinha[]
  total: number
  faltaPreco: string[] // descrições consideradas mas sem preço
  temDados: boolean
}

export async function getProdutoPrecos(
  unitId: string,
): Promise<ProdutoPreco[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("unit_produto_precos")
    .select("id, codigo, descricao, categoria, preco, considerar")
    .eq("unit_id", unitId)
  if (error) {
    console.error("getProdutoPrecos:", error.message)
    return []
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    codigo: String(r.codigo),
    descricao: (r.descricao as string | null) ?? "",
    categoria: (r.categoria as string | null) ?? "",
    preco: Number(r.preco) || 0,
    considerar: !!r.considerar,
  }))
}

/** Quantidade por código da(s) semana(s) que cobrem [inicio, fim]. */
export async function getProdutosVendidosSemana(
  unitId: string,
  inicio: string,
  fim: string,
): Promise<{ codigo: string; descricao: string; quantidade: number }[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("unit_produtos_vendidos")
    .select("codigo, descricao, quantidade")
    .eq("unit_id", unitId)
    .lte("periodo_inicio", fim)
    .gte("periodo_fim", inicio)
  if (error) {
    console.error("getProdutosVendidosSemana:", error.message)
    return []
  }
  const map = new Map<string, { descricao: string; quantidade: number }>()
  for (const r of data ?? []) {
    const cod = String(r.codigo)
    const prev = map.get(cod)
    const q = Number(r.quantidade) || 0
    if (prev) prev.quantidade += q
    else map.set(cod, { descricao: (r.descricao as string) ?? "", quantidade: q })
  }
  return [...map.entries()].map(([codigo, v]) => ({
    codigo,
    descricao: v.descricao,
    quantidade: v.quantidade,
  }))
}

/** Junta produtos vendidos (por código) + preços → detalhamento e total. */
export async function computeVinagreteRef(
  unitId: string,
  inicio: string,
  fim: string,
): Promise<VinagreteRef> {
  const [produtos, precos] = await Promise.all([
    getProdutosVendidosSemana(unitId, inicio, fim),
    getProdutoPrecos(unitId),
  ])
  const precoMap = new Map(precos.map((p) => [p.codigo, p]))

  const linhas: VinagreteLinha[] = produtos
    .map((pr) => {
      const p = precoMap.get(pr.codigo)
      const considerar = p ? p.considerar : true
      const preco = p ? p.preco : null
      const soma = considerar && preco != null ? pr.quantidade * preco : 0
      return {
        codigo: pr.codigo,
        descricao: pr.descricao || p?.descricao || pr.codigo,
        categoria: p?.categoria ?? "",
        quantidade: pr.quantidade,
        preco,
        considerar,
        soma,
        semPreco: p == null,
      }
    })
    .sort((a, b) => b.quantidade - a.quantidade)

  const total = Math.round(linhas.reduce((a, l) => a + l.soma, 0) * 100) / 100
  const faltaPreco = linhas
    .filter((l) => l.considerar && (l.preco == null || l.preco === 0))
    .map((l) => l.descricao)

  return {
    periodoInicio: inicio,
    periodoFim: fim,
    linhas,
    total,
    faltaPreco,
    temDados: produtos.length > 0,
  }
}
