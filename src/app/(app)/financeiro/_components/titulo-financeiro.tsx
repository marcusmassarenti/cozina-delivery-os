"use client"

import { useSearchParams } from "next/navigation"
import { Coins } from "lucide-react"

/**
 * "Financeiro — Hortolândia" quando há loja escolhida.
 *
 * É client component por necessidade: o `layout.tsx` do Financeiro é Server
 * Component e layouts do App Router NÃO recebem `searchParams` (só as pages).
 * Como a loja escolhida vive na query (`?loja=`), quem monta o título precisa
 * ler a URL do lado do cliente — mesma coisa que o `LojaSelector` já faz.
 *
 * Por que importa: o seletor de loja fica na outra ponta da tela, e num print
 * ou num PDF exportado ele some do enquadramento. O número aparecia sozinho,
 * sem dizer de quem era. Com o nome ao lado do título, a tela se explica.
 */
export function TituloFinanceiro({
  units,
}: {
  units: { id: string; name: string }[]
}) {
  const loja = useSearchParams().get("loja")
  // "todas" (consolidado) não vira sufixo: é o estado padrão, e repetir
  // "Financeiro — Consolidado" em toda tela é ruído.
  const nome =
    loja === "rede"
      ? "Rede (geral)"
      : loja
        ? (units.find((u) => u.id === loja)?.name ?? null)
        : null

  return (
    <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
      <Coins className="size-6 text-muted-foreground" />
      Financeiro
      {/* hidden no mobile: nome comprido ("Churrasco no Pão — Jardins") quebra
          o h1 em duas linhas e desalinha o ícone — e ali o seletor de loja fica
          logo abaixo do título, então o sufixo só repetiria o que já se lê. */}
      {nome && (
        <span className="hidden font-normal text-muted-foreground sm:inline">
          — {nome}
        </span>
      )}
    </h1>
  )
}
