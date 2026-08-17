"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"

/**
 * Seletor de categoria — combobox próprio, não `<input list>`.
 *
 * ── POR QUE ABANDONEI O DATALIST (Marcus, 16/08/26) ──────────────────────
 * "seletor tem que abrir pra baixo e com a mesma fonte." O `<datalist>` nativo
 * é desenhado pelo SISTEMA OPERACIONAL, não pela página: usa a fonte do SO, o
 * tema do SO, e decide sozinho abrir pra cima quando a linha está na metade de
 * baixo da tela. Nada disso é estilizável — não existe seletor CSS que alcance
 * aquele popup. A única saída é desenhar o nosso.
 *
 * Continua aceitando texto livre: quem quiser uma categoria que não está na
 * lista escreve e pronto. A lista é sugestão, não gaiola.
 */
export function SeletorCategoria({
  valor,
  opcoes,
  onEscolher,
  className,
}: {
  valor: string | null
  opcoes: string[]
  onEscolher: (v: string) => void
  className?: string
}) {
  const [aberto, setAberto] = React.useState(false)
  const [texto, setTexto] = React.useState(valor ?? "")
  const raiz = React.useRef<HTMLDivElement>(null)

  // O valor pode mudar por fora (aplicação em massa, refresh do servidor).
  React.useEffect(() => setTexto(valor ?? ""), [valor])

  React.useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener("mousedown", fora)
    return () => document.removeEventListener("mousedown", fora)
  }, [aberto])

  const filtradas = React.useMemo(() => {
    const q = texto.trim().toLowerCase()
    if (!q) return opcoes
    return opcoes.filter((o) => o.toLowerCase().includes(q))
  }, [opcoes, texto])

  function confirmar(v: string) {
    setTexto(v)
    setAberto(false)
    if (v !== (valor ?? "")) onEscolher(v)
  }

  return (
    <div ref={raiz} className={`relative ${className ?? ""}`}>
      <div className="flex items-center">
        <input
          value={texto}
          placeholder="—"
          onChange={(e) => {
            setTexto(e.target.value)
            setAberto(true)
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              confirmar(texto.trim())
            } else if (e.key === "Escape") {
              setAberto(false)
              setTexto(valor ?? "")
            }
          }}
          onBlur={() => {
            // Sem o atraso, o blur fecha a lista antes do clique na opção
            // registrar — e o clique não faz nada.
            setTimeout(() => confirmar(texto.trim()), 120)
          }}
          className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-xs outline-none hover:border-border focus:border-ring"
        />
        <ChevronDown
          className="pointer-events-none -ml-4 size-3 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </div>

      {aberto && filtradas.length > 0 && (
        // top-full: SEMPRE pra baixo. E a fonte é a da página, porque agora é
        // um elemento da página.
        <ul className="absolute left-0 top-full z-30 mt-1 max-h-56 w-44 overflow-y-auto rounded-lg border bg-popover py-1 shadow-lg">
          {filtradas.map((o) => (
            <li key={o}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => confirmar(o)}
                className={
                  o === valor
                    ? "block w-full px-2.5 py-1.5 text-left text-xs font-semibold text-primary hover:bg-muted"
                    : "block w-full px-2.5 py-1.5 text-left text-xs hover:bg-muted"
                }
              >
                {o}
              </button>
            </li>
          ))}
          {texto.trim() !== "" &&
            !opcoes.some(
              (o) => o.toLowerCase() === texto.trim().toLowerCase(),
            ) && (
              <li className="border-t">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => confirmar(texto.trim())}
                  className="block w-full px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
                >
                  Criar “{texto.trim()}”
                </button>
              </li>
            )}
        </ul>
      )}
    </div>
  )
}
