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
