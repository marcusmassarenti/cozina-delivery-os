import "server-only"

/**
 * Repete uma chamada do Supabase que voltou com erro, com uma pausa curta.
 *
 * A falha típica aqui é passageira — timeout quando muitas consultas chegam
 * juntas —, e antes ela virava dado pela metade na primeira tentativa. Só
 * repete quando há `error`; resposta boa sai na hora.
 */
export async function comRetentativa<R extends { error: unknown }>(
  chamar: () => PromiseLike<R>,
  tentativas = 3,
): Promise<R> {
  let r = await chamar()
  for (let t = 1; t < tentativas && r.error; t++) {
    await new Promise((ok) => setTimeout(ok, 300 * t))
    r = await chamar()
  }
  return r
}

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
  /**
   * Chamado quando uma página falha mesmo depois das novas tentativas. Aí o
   * que volta é PARCIAL — quem vai afirmar o número precisa saber disso.
   */
  opts?: { onErro?: (mensagem: string) => void },
): Promise<T[]> {
  const all: T[] = []
  const SIZE = 1000
  let from = 0
  for (let i = 0; i < 1000; i++) {
    const { data, error } = await comRetentativa(() =>
      build(from, from + SIZE - 1),
    )
    if (error) {
      /* ⚠️ DAQUI PRA FRENTE O RESULTADO É PARCIAL.
       * Continua devolvendo o que já leu — as telas preferem número com aviso
       * a card quebrado (decisão do Marcus, opção A de 30/07/26). Mas agora
       * quem precisa saber é avisado, em vez de receber metade com cara de
       * inteiro. */
      console.error(`${label}:`, error.message)
      opts?.onErro?.(error.message)
      break
    }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < SIZE) break
    from += SIZE
  }
  return all
}

/**
 * TODAS as linhas de uma RPC que devolve tabela, de 1000 em 1000.
 *
 * ⚠️ POR QUE (DG FOODS, 25/09/26) ─────────────────────────────────────────
 * RPC também é cortada no limite de 1000 linhas do PostgREST, e sem aviso.
 * `ifood_financeiro_diario_by_units` devolve uma linha por loja × dia: com 80
 * lojas, agosto tem 1.554 linhas e chegavam 1.000 — o Relatório Diário, as
 * Infos Diária e o Ranking da DG liam R$ 803.844 de R$ 1.086.592 (26% a
 * menos). Rede pequena não sente: 14 lojas × 31 dias cabem numa página.
 *
 * Diferente de `fetchAllRows`, aqui falha NÃO devolve o pedaço lido: volta
 * erro, e quem chama decide (cai no caminho alternativo, marca parcial).
 * Número que vai pro cache e pro ranking não pode ser metade com cara de
 * inteiro.
 *
 * `build` precisa ORDENAR por uma chave única da linha (ex.: unit_id, dia) —
 * sem ordem, a paginação de uma função pode pular ou repetir linha.
 */
export async function rpcTodasAsLinhas<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const todas: T[] = []
  const SIZE = 1000
  for (let from = 0; from < 1_000_000; from += SIZE) {
    const { data, error } = await comRetentativa(() =>
      build(from, from + SIZE - 1),
    )
    if (error) return { data: null, error }
    todas.push(...(data ?? []))
    if (!data || data.length < SIZE) break
  }
  return { data: todas, error: null }
}
