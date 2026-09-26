import type { ReactNode } from "react"
import { CalendarClock, Check, Clock, Hourglass } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { fmtBRL } from "@/lib/format"
import type { RecebiveisRede } from "@/lib/data/recebiveis-rede"

const NOME: Partial<Record<PlatformId, string>> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
}

function fmtDia(d: string) {
  const [, m, day] = d.split("-")
  return `${day}/${m}`
}

/**
 * "Do DRE ao caixa" — o líquido das plataformas, visto pela DATA em que cai
 * na conta (Marcus, 25/09/26: "os recebíveis, que poderiam ser somados").
 *
 * NÃO SOMA NO RESULTADO: é o mesmo dinheiro da linha "Líquido" do DRE. Por
 * isso o bloco fica embaixo da demonstração, com o líquido de cada plataforma
 * ao lado, e não vira linha dela.
 *
 * "Sem data ainda" é o que o DRE já conta e nenhum repasse trouxe com data:
 * venda que ainda não entrou num ciclo, dinheiro recebido direto na entrega,
 * vale-refeição (cai por outro canal) e Fatura da Keeta não importada.
 */
export function DoDreAoCaixa({
  dados,
  liquidoDre,
}: {
  dados: RecebiveisRede
  /** Líquido de cada plataforma no DRE, mesmo período. */
  liquidoDre: Partial<Record<PlatformId, number>>
}) {
  if (dados.plataformas.length === 0) return null
  const { totais } = dados
  const temAberto = totais.emAberto > 0
  const estimado = dados.plataformas.some((p) => p.estimado)
  const taxa = dados.plataformas.reduce((s, p) => s + p.taxaAntecipacao, 0)
  const taxaEst = dados.plataformas.reduce((s, p) => s + p.taxaAntecipacaoEstimada, 0)
  const liquidoTotal = dados.plataformas.reduce((s, p) => s + (liquidoDre[p.id] ?? 0), 0)
  const semData = (id: PlatformId, coberto: number) =>
    Math.max(0, (liquidoDre[id] ?? 0) - coberto)

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b px-5 py-3">
        <div className="flex items-start gap-2">
          <CalendarClock className="mt-0.5 size-4 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold">Do DRE ao caixa</h2>
            <p className="text-[11px] text-muted-foreground">
              Quando o líquido das vendas do período cai na conta. Não soma no
              resultado — é o mesmo dinheiro do DRE, pela data do depósito.
            </p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          Líquido das plataformas no DRE:{" "}
          <strong className="tabular-nums text-foreground">{fmtBRL(liquidoTotal)}</strong>
        </span>
      </div>

      {/* Resumo: o que já está na conta, o que tem data e o que ainda corre */}
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
        <Resumo
          icone={<Check className="size-3.5 text-emerald-600" strokeWidth={3} />}
          rotulo="Já caiu na conta"
          valor={totais.jaCaiu}
          classe="text-emerald-700 dark:text-emerald-400"
        />
        <Resumo
          icone={<Clock className="size-3.5 text-amber-600" />}
          rotulo="A cair · ciclo fechado"
          valor={totais.aCair}
          classe="text-amber-700 dark:text-amber-400"
          nota="valor e data já definidos pela plataforma"
        />
        <Resumo
          icone={<Hourglass className="size-3.5 text-muted-foreground" />}
          rotulo="Semana em aberto"
          valor={totais.emAberto}
          classe="text-foreground"
          nota={
            temAberto
              ? estimado
                ? "ainda cresce · data estimada p/ quem antecipa"
                : "ainda cresce até o iFood fechar o ciclo"
              : "nenhum ciclo em andamento"
          }
        />
      </div>

      {/* Por plataforma, com o líquido do DRE ao lado pra conferir */}
      <div className="overflow-x-auto px-5 pb-4">
        <table className="w-full min-w-[560px] text-xs tabular-nums">
          <thead>
            <tr className="border-b text-[11px] text-muted-foreground">
              <th className="py-1.5 text-left font-medium">Plataforma</th>
              <th className="py-1.5 text-right font-medium">Líquido no DRE</th>
              <th className="py-1.5 text-right font-medium">Já caiu</th>
              <th className="py-1.5 text-right font-medium">A cair</th>
              <th className="py-1.5 text-right font-medium">Em aberto</th>
              <th className="py-1.5 text-right font-medium">Sem data ainda</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {dados.plataformas.map((p) => (
              <tr key={p.id}>
                <td className="py-2">
                  <span className="flex items-center gap-2">
                    <PlatformLogo platform={p.id} size="sm" />
                    {NOME[p.id] ?? p.id}
                  </span>
                </td>
                <td className="py-2 text-right text-muted-foreground">
                  {fmtBRL(liquidoDre[p.id] ?? 0)}
                </td>
                <td className="py-2 text-right text-emerald-700 dark:text-emerald-400">
                  {fmtBRL(p.jaCaiu)}
                </td>
                <td className="py-2 text-right text-amber-700 dark:text-amber-400">
                  {p.aCair > 0 ? fmtBRL(p.aCair) : "—"}
                </td>
                <td className="py-2 text-right">
                  {p.emAberto > 0 ? `${p.estimado ? "~" : ""}${fmtBRL(p.emAberto)}` : "—"}
                </td>
                <td className="py-2 text-right text-muted-foreground">
                  {(() => {
                    const v = semData(p.id, p.jaCaiu + p.aCair + p.emAberto)
                    return v > 0.5 ? fmtBRL(v) : "—"
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dados.proximos.length > 0 && (
        <div className="border-t px-5 py-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Próximos depósitos
          </p>
          <ul className="flex flex-wrap gap-2">
            {dados.proximos.map((d) => (
              <li
                key={d.data}
                className="flex items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-1 text-xs"
              >
                <span className="font-medium">
                  {d.estimado ? "~" : ""}
                  {fmtDia(d.data)}
                </span>
                <span className="tabular-nums">{fmtBRL(d.valor)}</span>
                <span className="flex items-center gap-0.5">
                  {d.plataformas.map((id) => (
                    <PlatformLogo key={id} platform={id} size="sm" />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {taxa + taxaEst > 0 && (
        <p className="border-t px-5 py-3 text-[11px] text-muted-foreground">
          Antecipação do iFood: <strong className="text-foreground">{fmtBRL(taxa)}</strong>{" "}
          de taxa nos ciclos fechados (a mesma linha do DRE acima)
          {taxaEst > 0 && (
            <>
              {" "}
              + ~<strong className="text-foreground">{fmtBRL(taxaEst)}</strong> estimados na
              semana em aberto
            </>
          )}
          . Os valores acima já vêm descontados dela.
        </p>
      )}
    </section>
  )
}

function Resumo({
  icone,
  rotulo,
  valor,
  classe,
  nota,
}: {
  icone: ReactNode
  rotulo: string
  valor: number
  classe: string
  nota?: string
}) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icone}
        {rotulo}
      </p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${classe}`}>{fmtBRL(valor)}</p>
      {nota && <p className="text-[10px] text-muted-foreground">{nota}</p>}
    </div>
  )
}
