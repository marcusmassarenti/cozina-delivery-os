"use client"

/**
 * "Este aviso já foi visto/fechado neste navegador?" — sem efeito.
 *
 * O jeito intuitivo é `useState` + `useEffect` lendo o storage. Funciona, mas o
 * React 19 reclama com razão (`react-hooks/set-state-in-effect`): a primeira
 * renderização sai com o valor errado e uma segunda a corrige, o que na tela é
 * o aviso piscando — aparece e some, ou some e aparece.
 *
 * `useSyncExternalStore` resolve pela raiz: o valor é LIDO durante a
 * renderização, então já sai certo de primeira. O `noServidor` é o que o
 * servidor deve assumir enquanto não existe navegador — e ele é por caso, não
 * global: num aviso comemorativo o certo é presumir "já viu" e não mostrar
 * nada; num aviso de pendência, presumir "não fechou" e mostrar.
 *
 * O storage só muda por ação nossa (nada escreve nele por fora), então a
 * inscrição serve só pra re-renderizar quem está na tela quando alguém marca.
 */
import * as React from "react"

type Tipo = "local" | "session"

const ouvintes = new Set<() => void>()

function assinar(aoMudar: () => void): () => void {
  ouvintes.add(aoMudar)
  return () => {
    ouvintes.delete(aoMudar)
  }
}

/** Storage pode lançar (modo privativo, cookies bloqueados). Nunca derruba a tela. */
function area(tipo: Tipo): Storage | null {
  try {
    return tipo === "local" ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

export function useMarcaNavegador(
  tipo: Tipo,
  chave: string,
  opts: { valor?: string; noServidor?: boolean } = {},
): readonly [boolean, () => void] {
  const valor = opts.valor ?? "1"
  const noServidor = opts.noServidor ?? false

  // Sem storage (modo privativo), `area` devolve null e isto vira false — ou
  // seja, "não marcado", e o aviso aparece. É o lado certo pra errar: quem
  // navega sem storage vê o aviso de novo, em vez de nunca vê-lo.
  const marcado = React.useSyncExternalStore(
    assinar,
    () => area(tipo)?.getItem(chave) === valor,
    () => noServidor,
  )

  const marcar = React.useCallback(() => {
    try {
      area(tipo)?.setItem(chave, valor)
    } catch {
      // Sem storage a marca não persiste. A tela ainda fecha o aviso pelo
      // re-render abaixo — só volta na próxima visita.
    }
    for (const aoMudar of ouvintes) aoMudar()
  }, [tipo, chave, valor])

  return [marcado, marcar] as const
}
