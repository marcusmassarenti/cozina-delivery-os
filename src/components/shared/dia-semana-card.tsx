import { CalendarDays } from "lucide-react"

import { fmtBRL, fmtBRLShort, fmtNum } from "@/lib/format"
import type { VendasPorDiaSemana } from "@/lib/data/dia-semana"

/**
 * Dias com mais vendas — barras por dia da semana, melhor destacado.
 *
 * Existe porque a série mensal esconde o dia: dentro do mês, "vendeu 900 mil"
 * não diz que a sexta faz 34% a mais que a terça (medido na rede em jul/26).
 * Isso é escala de equipe e onde colocar promoção.
 *
 * As barras são por VALOR e o número em cima também. Antes de trocar por
 * pedidos, lembrar que ticket médio varia por dia — o dia com mais pedidos
 * nem sempre é o que fatura mais.
 */
export function DiaSemanaCard({
  dados,
  titulo = "Dias com mais vendas",
}: {
  dados: VendasPorDiaSemana
  titulo?: string
}) {
  const { dias, melhor, pior, plataformas } = dados
  if (!melhor) return null

  const max = Math.max(...dias.map((d) => d.valor), 1)

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <CalendarDays className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{titulo}</h3>
      </div>

      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Melhor dia
        </span>
        <span className="text-lg font-bold">{melhor.rotulo}</span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {fmtBRL(melhor.valor)} · {fmtNum(melhor.pedidos)} pedidos
        </span>
      </div>

      {/* ⚠️ A ÁREA DA BARRA precisa de altura DEFINIDA (h-20 aqui).
          Antes a coluna era um flex-col sem altura e a barra usava height em
          %, que não tem base nenhuma nesse caso — o navegador resolvia pra
          zero e o gráfico aparecia vazio, só com os números. */}
      <div className="flex items-end gap-1.5">
        {dias.map((d) => {
          const alturaPct = (d.valor / max) * 100
          const ehMelhor = d.dow === melhor.dow
          const ehPior = pior != null && d.dow === pior.dow && !ehMelhor
          return (
            <div
              key={d.dow}
              className="flex flex-1 flex-col items-center gap-1"
              title={`${d.rotulo}: ${fmtBRL(d.valor)} · ${fmtNum(d.pedidos)} pedidos`}
            >
              <span
                className={`text-[10px] font-bold tabular-nums ${
                  ehMelhor
                    ? "text-emerald-700 dark:text-emerald-400"
                    : ehPior
                      ? "text-rose-700 dark:text-rose-400"
                      : "text-muted-foreground"
                }`}
              >
                {fmtBRLShort(d.valor)}
              </span>
              <div className="flex h-20 w-full items-end">
                <div
                  className={`w-full rounded-t ${
                    ehMelhor
                      ? "bg-emerald-500"
                      : ehPior
                        ? "bg-rose-400"
                        : "bg-muted-foreground/25"
                  }`}
                  // Mínimo pra o dia sem venda ainda desenhar um traço —
                  // barra de altura zero some e parece dado faltando.
                  style={{
                    height: `${Math.max(alturaPct, d.valor > 0 ? 8 : 3)}%`,
                  }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">
                {d.rotuloCurto}
              </span>
            </div>
          )
        })}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        {pior && pior.dow !== melhor.dow && (
          <>
            <strong>{pior.rotulo}</strong> é o mais fraco, com{" "}
            {fmtBRL(pior.valor)} —{" "}
            {Math.round(((melhor.valor - pior.valor) / pior.valor) * 100)}% abaixo
            da {melhor.rotulo.toLowerCase()}.{" "}
          </>
        )}
        Soma {plataformas.join(" e ")} — as outras plataformas guardam a data do
        pedido, mas não o valor.
      </p>
    </div>
  )
}
