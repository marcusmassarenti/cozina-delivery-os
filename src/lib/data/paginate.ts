import "server-only"

/**
 * Busca TODAS as linhas de uma query paginando de 1000 em 1000.
 *
 * O PostgREST desse projeto corta a resposta em 1000 linhas por request,
 * então `.limit(N)` com N grande NÃO traz tudo — silenciosamente devolve só
 * as primeiras 1000. A forma correta é paginar com `.range(from, to)` +
 * `.order()` estável (uma coluna única, tipo `id`, pra não pular/duplicar
 * linha na borda das páginas).
 *
 * Uso:
 *   const rows = await fetchAllRows((from, to) =>
 *     admin.from("tabela").select("...").order("id").range(from, to),
 *   )
 */
export async function fetchAllRows<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label = "fetchAllRows",
): Promise<T[]> {
  const all: T[] = []
  const SIZE = 1000
  let from = 0
  for (let i = 0; i < 1000; i++) {
    const { data, error } = await build(from, from + SIZE - 1)
    if (error) {
      console.error(`${label}:`, error.message)
      break
    }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < SIZE) break
    from += SIZE
  }
  return all
}
