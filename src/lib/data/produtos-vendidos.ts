import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export type CategoriaPreco = {
  id: string
  categoria: string
  preco: number
  considerar: boolean
}

export type VinagreteLinha = {
  categoria: string
  quantidade: number
  preco: number | null // null = sem preço cadastrado
  considerar: boolean
  soma: number
  semPreco: boolean
}

export type VinagreteRef = {
  periodoInicio: string
  periodoFim: string
  linhas: VinagreteLinha[]
  total: number
  faltaPreco: string[] // categorias consideradas mas sem preço
  temDados: boolean
}

/** Chave de match: minúsculo, sem acento, espaços colapsados. */
export function normCat(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tira acentos
    .replace(/\s+/g, " ")
    .trim()
}

export async function getCategoriaPrecos(
  unitId: string,
): Promise<CategoriaPreco[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("unit_categoria_precos")
    .select("id, categoria, preco, considerar")
    .eq("unit_id", unitId)
    .order("categoria")
  if (error) {
    console.error("getCategoriaPrecos:", error.message)
    return []
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    categoria: r.categoria as string,
    preco: Number(r.preco) || 0,
    considerar: !!r.considerar,
  }))
}

/** Soma de quantidade por categoria da(s) semana(s) que cobrem [inicio, fim]. */
export async function getProdutosVendidosSemana(
  unitId: string,
  inicio: string,
  fim: string,
): Promise<{ categoria: string; quantidade: number }[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("unit_produtos_vendidos")
    .select("categoria, quantidade")
    .eq("unit_id", unitId)
    .lte("periodo_inicio", fim)
    .gte("periodo_fim", inicio)
  if (error) {
    console.error("getProdutosVendidosSemana:", error.message)
    return []
  }
  // soma por categoria (caso haja mais de um registro na janela)
  const map = new Map<string, number>()
  for (const r of data ?? []) {
    const cat = String(r.categoria)
    map.set(cat, (map.get(cat) ?? 0) + (Number(r.quantidade) || 0))
  }
  return [...map.entries()].map(([categoria, quantidade]) => ({
    categoria,
    quantidade,
  }))
}

/** Junta produtos vendidos + preços → detalhamento e total do vinagrete. */
export async function computeVinagreteRef(
  unitId: string,
  inicio: string,
  fim: string,
): Promise<VinagreteRef> {
  const [produtos, precos] = await Promise.all([
    getProdutosVendidosSemana(unitId, inicio, fim),
    getCategoriaPrecos(unitId),
  ])
  const precoMap = new Map(precos.map((p) => [normCat(p.categoria), p]))

  const linhas: VinagreteLinha[] = produtos
    .map((pr) => {
      const p = precoMap.get(normCat(pr.categoria))
      const considerar = p ? p.considerar : true
      const preco = p ? p.preco : null
      const soma = considerar && preco != null ? pr.quantidade * preco : 0
      return {
        categoria: pr.categoria,
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
    .map((l) => l.categoria)

  return {
    periodoInicio: inicio,
    periodoFim: fim,
    linhas,
    total,
    faltaPreco,
    temDados: produtos.length > 0,
  }
}
