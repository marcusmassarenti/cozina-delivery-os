"use client"

import * as React from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { Check, ChevronDown, Store } from "lucide-react"

import { useNavigate } from "@/components/shared/navigation-progress"
import {
  ordenarPlataformas,
  PLATAFORMAS,
  PlatformLogo,
  rotuloPlataforma,
  type PlatformId,
} from "@/components/platform-logo"

/**
 * Filtro de plataformas reutilizável, irmão do `LojaFilter`.
 *
 * Escreve no query param `plataformas` (ids separados por vírgula) — o MESMO
 * que o Dashboard já usa. Manter o nome do parâmetro é o que faz o filtro
 * sobreviver quando a pessoa navega entre as telas com o link colado.
 *
 * O filtro do Dashboard mora dentro de `DashboardFilters`, junto de outros
 * quatro, e não é exportável sem desmontar aquele componente. Este nasce à
 * parte de propósito, mas fala a mesma língua: mesmo param, mesma ordem
 * canônica, mesmo visual.
 */
export function PlatformFilter({
  disponiveis = PLATAFORMAS,
  param = "plataformas",
}: {
  /** Só as plataformas que a loja realmente usa — sem chip morto na tela. */
  disponiveis?: PlatformId[]
  param?: string
}) {
  const navigate = useNavigate()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const daUrl = (searchParams.get(param) ?? "").split(",").filter(Boolean)
  const chave = daUrl.join(",")
  const [open, setOpen] = React.useState(false)
  const [sel, setSel] = React.useState<Set<string>>(new Set(daUrl))

  // Resync quando a URL muda por fora (voltar/avançar do navegador).
  React.useEffect(() => {
    setSel(new Set(chave ? chave.split(",") : []))
  }, [chave])

  const lista = ordenarPlataformas(disponiveis)
  const filtrando = sel.size > 0 && sel.size < lista.length

  function aplicar(next: Set<string>) {
    const params = new URLSearchParams(searchParams.toString())
    // Vazio OU tudo selecionado = "todas": some da URL em vez de virar uma
    // lista gigante que diz o mesmo que a ausência dela.
    if (next.size === 0 || next.size === lista.length) params.delete(param)
    else params.set(param, ordenarPlataformas([...next] as PlatformId[]).join(","))
    navigate(`${pathname}?${params.toString()}`)
  }

  function alternar(id: PlatformId) {
    const next = new Set(sel)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSel(next)
    aplicar(next)
  }

  const ativas = [...sel] as PlatformId[]

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ${
          filtrando
            ? "border-primary bg-primary/10 text-primary"
            : "bg-card hover:bg-muted"
        }`}
      >
        {filtrando && ativas.length === 1 ? (
          <PlatformLogo platform={ativas[0]} size="sm" />
        ) : (
          <Store className="size-3.5" />
        )}
        {!filtrando
          ? "Todas plataformas"
          : ativas.length === 1
            ? rotuloPlataforma(ativas[0])
            : `${ativas.length} plataformas`}
        <ChevronDown className="size-3.5 opacity-60" />
      </button>

      {open && (
        <>
          {/* Camada de fechar por fora — sem ela o popover fica preso aberto
              em quem navega por toque. */}
          <button
            type="button"
            aria-label="Fechar"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border bg-card p-1 shadow-lg">
            {lista.map((id) => {
              const marcada = sel.has(id)
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => alternar(id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted"
                >
                  <span className="flex size-4 items-center justify-center">
                    {marcada && <Check className="size-3.5 text-primary" />}
                  </span>
                  <PlatformLogo platform={id} size="sm" />
                  <span className="flex-1">{rotuloPlataforma(id)}</span>
                </button>
              )
            })}
            {filtrando && (
              <button
                type="button"
                onClick={() => {
                  setSel(new Set())
                  aplicar(new Set())
                  setOpen(false)
                }}
                className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted"
              >
                Limpar filtro
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
