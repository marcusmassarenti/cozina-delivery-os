import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Sparkles } from "lucide-react"

import { isSuperadmin } from "@/lib/auth/permissions"
import { getConsumoIaPorCliente } from "@/lib/data/ia-custos"
import { fmtNum } from "@/lib/format"

/** USD → BRL só pra leitura rápida (taxa fixa; o custo real é cobrado em USD). */
const USD_BRL = 5.5
const fmtUsd = (v: number) =>
  `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtBrlAprox = (usd: number) =>
  `≈ R$ ${(usd * USD_BRL).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function mesAtual(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
function rotuloMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number)
  return new Date(y!, (m ?? 1) - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  })
}

export default async function ConsumoIaPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  if (!(await isSuperadmin())) notFound()
  const sp = await searchParams
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : mesAtual()
  const { clientes, totalUsd, totalMensagens } = await getConsumoIaPorCliente(mes)

  // Últimos 6 meses pro seletor.
  const meses: string[] = []
  const base = new Date()
  for (let i = 0; i < 6; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1)
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }

  const comUso = clientes.filter((c) => c.mensagens > 0 || c.custoUsd > 0)

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/plataforma"
          className="inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Voltar para clientes
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Sparkles className="size-5 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">
              Consumo do Nino AI
            </h1>
          </div>
          <div className="flex flex-wrap gap-1">
            {meses.map((m) => (
              <Link
                key={m}
                href={`/plataforma/consumo-ia?mes=${m}`}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  m === mes
                    ? "bg-primary text-primary-foreground"
                    : "border hover:bg-muted"
                }`}
              >
                {rotuloMes(m)}
              </Link>
            ))}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Quanto cada cliente usou o Nino e quanto isso custou de API. O custo é
          medido pelos tokens de cada resposta — vale só a partir de 23/07/2026
          (antes disso os tokens não eram registrados).
        </p>
      </div>

      {/* Totais do mês */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card label="Mensagens no mês" valor={fmtNum(totalMensagens)} />
        <Card
          label="Custo de API"
          valor={fmtUsd(totalUsd)}
          sub={fmtBrlAprox(totalUsd)}
          destaque
        />
        <Card
          label="Custo médio por mensagem"
          valor={
            totalMensagens > 0 ? fmtUsd(totalUsd / totalMensagens) : "—"
          }
          sub={
            totalMensagens > 0
              ? fmtBrlAprox(totalUsd / totalMensagens)
              : undefined
          }
        />
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 font-semibold">Cliente</th>
              <th className="px-4 py-2.5 text-right font-semibold">Mensagens</th>
              <th className="px-4 py-2.5 text-right font-semibold">
                Tokens (entrada / saída)
              </th>
              <th className="px-4 py-2.5 text-right font-semibold">Buscas web</th>
              <th className="px-4 py-2.5 text-right font-semibold">Custo</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {comUso.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  Ninguém usou o Nino neste mês.
                </td>
              </tr>
            ) : (
              comUso.map((c) => (
                <tr key={c.holdingId} className="hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/plataforma/${c.holdingId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {c.cliente}
                    </Link>
                    {c.respostasMedidas < c.mensagens && (
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        ({c.respostasMedidas} de {c.mensagens} com custo medido)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {fmtNum(c.mensagens)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {fmtNum(c.inputTokens)} / {fmtNum(c.outputTokens)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {c.webSearches > 0 ? fmtNum(c.webSearches) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                    {c.custoUsd > 0 ? fmtUsd(c.custoUsd) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        Preço do modelo Haiku 4.5: US$ 1,00 por milhão de tokens de entrada e
        US$ 5,00 por milhão de saída; busca na web US$ 10 por mil buscas.
        Conversão pra real usa taxa fixa de R$ {USD_BRL.toFixed(2)} só como
        referência.
      </p>
    </div>
  )
}

function Card({
  label,
  valor,
  sub,
  destaque,
}: {
  label: string
  valor: string
  sub?: string
  destaque?: boolean
}) {
  return (
    <div
      className={`rounded-xl border bg-card px-4 py-3 shadow-sm ${destaque ? "border-primary/30" : ""}`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{valor}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}
