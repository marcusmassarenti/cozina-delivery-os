"use client"

import * as React from "react"

const KEY = "cozina:nav-grupos-fechados"

/**
 * Quais categorias do menu estão fechadas — lembrado entre visitas.
 *
 * ── POR QUE (Marcus, 20/08/26) ───────────────────────────────────────────
 * "Quando eu fechar uma categoria, tem que lembrar dela sempre permanecer
 * fechada."
 *
 * O menu usava `defaultOpen`, que é só o estado INICIAL: fechar "Financeiro"
 * valia até a próxima navegação, e aí ele reabria. Com onze itens só em
 * Financeiro, quem não usa aquele bloco reabria o mesmo menu dezenas de vezes
 * por dia.
 *
 * Guarda os FECHADOS, não os abertos. Assim uma categoria nova que eu criar no
 * futuro nasce visível pra quem já usa o sistema — se guardasse os abertos,
 * ela nasceria escondida e ninguém descobriria que existe.
 *
 * localStorage é o certo aqui, diferente do aviso de conexão que virou tabela:
 * ali o "fechar" escondia uma informação de negócio que a pessoa precisava ver
 * em qualquer aparelho; aqui é preferência de layout, e cada tela tem a sua.
 */
export function useGruposMenu() {
  const [fechados, setFechados] = React.useState<string[]>([])
  const [pronto, setPronto] = React.useState(false)

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) setFechados(JSON.parse(raw))
    } catch {
      // Aba anônima ou storage cheio: abre tudo, que é o seguro.
    }
    setPronto(true)
  }, [])

  const alternar = React.useCallback((label: string, aberto: boolean) => {
    setFechados((prev) => {
      const next = aberto ? prev.filter((l) => l !== label) : [...prev, label]
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // ignora
      }
      return next
    })
  }, [])

  /**
   * `pronto` evita o pisca-pisca: antes de ler o storage, respeita o padrão do
   * grupo. Sem isso, um grupo fechado abriria por um instante a cada carga.
   */
  const estaAberto = React.useCallback(
    (label: string, padrao: boolean) =>
      pronto ? !fechados.includes(label) : padrao,
    [fechados, pronto],
  )

  return { estaAberto, alternar, pronto }
}
