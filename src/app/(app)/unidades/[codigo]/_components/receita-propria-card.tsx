"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2, Store } from "lucide-react"

import { saveReceitaPropria } from "@/app/(app)/dre/_actions"

function toNumber(s: string): number {
  const digits = s.replace(/\D/g, "")
  return parseInt(digits || "0", 10) / 100
}
function display(n: number): string {
  return n === 0
    ? ""
    : n.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
}

/**
 * Receita própria do mês — a venda que nenhum relatório enxerga.
 *
 * Card à parte, e não uma seção dentro de "Custos da loja", porque é receita:
 * enfiar entrada de dinheiro num bloco chamado Custos é o tipo de detalhe que
 * faz o lojista lançar no lugar errado.
 *
 * Grava OTIMISTA, igual ao editor de custos ao lado: o número aparece na hora
 * e o servidor confirma depois. A DRE atualiza com refresh debounced (~0,7s
 * depois que a pessoa para de digitar), senão a tela pisca a cada tecla.
 */
export function ReceitaPropriaCard({
  unitId,
  year,
  month,
  valorInicial,
  somenteLeitura = false,
}: {
  unitId: string
  year: number
  month: number
  valorInicial: number
  /** Loja emprestada por outra empresa: mostra o valor, não deixa editar. */
  somenteLeitura?: boolean
}) {
  const router = useRouter()
  const [valor, setValor] = React.useState(valorInicial)
  const [salvando, setSalvando] = React.useState(false)
  const [salvo, setSalvo] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)

  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  async function gravar(v: number) {
    setSalvando(true)
    setErro(null)
    const r = await saveReceitaPropria({ unitId, year, month, valor: v })
    setSalvando(false)
    if (!r.ok) {
      setErro(r.message ?? "Não deu pra salvar.")
      return
    }
    setSalvo(true)
    setTimeout(() => setSalvo(false), 1600)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => router.refresh(), 700)
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <Store className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Receita própria</h3>
        {salvando && (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        )}
        {salvo && !salvando && (
          <Check className="size-3.5 text-emerald-600" strokeWidth={2.6} />
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        balcão, salão, telefone — venda fora das plataformas
      </p>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-sm text-muted-foreground">R$</span>
        <input
          inputMode="numeric"
          disabled={somenteLeitura}
          value={display(valor)}
          placeholder="0,00"
          onChange={(e) => setValor(toNumber(e.target.value))}
          onBlur={() => {
            if (valor !== valorInicial) void gravar(valor)
          }}
          className="h-9 w-full rounded-md border bg-background px-2 text-right text-sm tabular-nums outline-none focus:border-primary disabled:opacity-60"
        />
      </div>

      {erro && <p className="mt-2 text-xs text-rose-600">{erro}</p>}

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Entra no faturamento bruto da loja e da rede. Não confunda com a{" "}
        <b>venda direta</b> da DRE — aquela é pedido de plataforma pago na
        entrega, e já vem sozinha no relatório.
      </p>
    </div>
  )
}
