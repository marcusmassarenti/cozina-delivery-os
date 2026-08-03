import "server-only"

/**
 * Cronômetro de fases pra páginas pesadas.
 *
 * Existe porque não dá pra medir o dashboard de fora: a página exige sessão, e
 * o log de execução da Vercel só traz rota e status — não a duração. E medir no
 * `localhost` engana: ali o servidor roda no Brasil consultando um banco em
 * Ohio, então cada consulta paga a travessia e o número sai várias vezes pior
 * do que a produção, onde a função roda em `iad1`, colada no banco.
 *
 * Emite UMA linha por render, legível em `vercel logs`:
 *   [perf] dashboard total=812ms auth=91 base=140 avisos=63 … lojas=57
 *
 * O total é o tempo até a página começar a ser enviada — o que roda dentro de
 * <Suspense> continua depois e NÃO entra na conta.
 */
export function criarCronometro(rotulo: string) {
  const inicio = Date.now()
  let ultimo = inicio
  const fases: string[] = []

  return {
    /** Fecha a fase anterior e abre a próxima. */
    marca(nome: string) {
      const agora = Date.now()
      fases.push(`${nome}=${agora - ultimo}`)
      ultimo = agora
    },
    /** `extra` entra na linha como `chave=valor` — use pro contexto do render. */
    fim(extra?: Record<string, string | number>) {
      const total = Date.now() - inicio
      const cauda = extra
        ? " " +
          Object.entries(extra)
            .map(([k, v]) => `${k}=${v}`)
            .join(" ")
        : ""
      console.log(`[perf] ${rotulo} total=${total}ms ${fases.join(" ")}${cauda}`)
    },
  }
}
