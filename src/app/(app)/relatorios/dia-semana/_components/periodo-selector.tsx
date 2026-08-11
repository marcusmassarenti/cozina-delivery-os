"use client"

import { useRouter, useSearchParams } from "next/navigation"

/**
 * Período do relatório de dia da semana.
 *
 * Duas naturezas de escolha, e a distinção importa:
 *  • JANELA MÓVEL (90 dias) — o padrão. Cada dia da semana ganha ~13 amostras,
 *    o que aguenta uma chuva de sábado sem virar "padrão".
 *  • MÊS FECHADO — pra comparar com o que o cliente já viu no fechamento.
 *    ⚠️ Um mês tem só 4 de cada dia; a leitura fica frágil e a tela avisa.
 */
const JANELAS = [
  { id: "30d", label: "30 dias" },
  { id: "90d", label: "90 dias" },
  { id: "180d", label: "180 dias" },
] as const

const MESES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
]

export function PeriodoSelector({
  atual,
  mesesFechados,
}: {
  atual: string
  /** ["2026-07", "2026-06", …] — do mais recente pro mais antigo. */
  mesesFechados: string[]
}) {
  const router = useRouter()
  const params = useSearchParams()

  const ir = (id: string) => {
    const q = new URLSearchParams(params.toString())
    if (id === "90d") q.delete("periodo")
    else q.set("periodo", id)
    router.push(`/relatorios/dia-semana${q.toString() ? `?${q}` : ""}`)
  }

  const pill = (ativo: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
      ativo ? "bg-foreground text-background" : "border bg-card hover:bg-muted"
    }`

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {JANELAS.map((j) => (
        <button
          key={j.id}
          type="button"
          onClick={() => ir(j.id)}
          className={pill(atual === j.id)}
        >
          {j.label}
        </button>
      ))}
      <span className="mx-1 h-4 w-px bg-border" />
      {mesesFechados.map((m) => {
        const [ano, mes] = m.split("-")
        return (
          <button
            key={m}
            type="button"
            onClick={() => ir(m)}
            className={pill(atual === m)}
          >
            {MESES[Number(mes) - 1]}/{ano!.slice(2)}
          </button>
        )
      })}
    </div>
  )
}
