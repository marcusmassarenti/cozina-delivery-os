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
  const { dias, melhor, pior, base, plataformasValor, plataformasPedidos } =
    dados
  // Quando o filtro deixa só plataforma sem preço, o card inteiro passa a
  // falar em pedidos — barras, rótulos e o resumo.
  const val = (d: { valor: number; pedidos: number }) =>
    base === "valor" ? d.valor : d.pedidos
  const fmtVal = (d: { valor: number; pedidos: number }) =>
    base === "valor" ? fmtBRLShort(d.valor) : `${fmtNum(d.pedidos)}`
  if (!melhor) return null

  const max = Math.max(...dias.map(val), 1)

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <CalendarDays className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{titulo}</h3>
      </div>

      {/* Resumo à ESQUERDA e barras à direita, não empilhados.
          Em largura cheia, 7 barras ocupando tudo viravam blocos gordos e o
          card ficava alto à toa. Lado a lado, a mesma informação cabe em
          metade da altura. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="shrink-0 sm:w-52">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Melhor dia
          </p>
          <p className="text-lg font-bold leading-tight">{melhor.rotulo}</p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {base === "valor" ? `${fmtBRL(melhor.valor)} · ` : ""}
            {fmtNum(melhor.pedidos)} pedidos
          </p>
          {pior && pior.dow !== melhor.dow && (
            <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
              <strong className="text-rose-700 dark:text-rose-400">
                {pior.rotulo}
              </strong>{" "}
              é o mais fraco —{" "}
              {Math.round(((val(melhor) - val(pior)) / val(pior)) * 100)}% abaixo
            </p>
          )}
        </div>
        <div className="min-w-0 flex-1">

      {/* ⚠️ A ÁREA DA BARRA precisa de altura DEFINIDA (h-20 aqui).
          Antes a coluna era um flex-col sem altura e a barra usava height em
          %, que não tem base nenhuma nesse caso — o navegador resolvia pra
          zero e o gráfico aparecia vazio, só com os números. */}
      <div className="flex items-end gap-1.5">
        {dias.map((d) => {
          const alturaPct = (val(d) / max) * 100
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
                {fmtVal(d)}
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
                    height: `${Math.max(alturaPct, val(d) > 0 ? 8 : 3)}%`,
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
        </div>
      </div>

      {/* Os dois escopos ditos lado a lado. Antes o rodapé falava só do valor
          e dava a entender que 99 e Keeta estavam fora de tudo — elas entram
          na contagem de pedidos, que é metade do que o card mostra. */}
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        {plataformasValor.length > 0 ? (
          <>
            <strong>Valor</strong>: {plataformasValor.join(" e ")}.{" "}
          </>
        ) : null}
        <strong>Pedidos</strong>: {plataformasPedidos.join(", ")}
        {plataformasValor.length < plataformasPedidos.length
          ? " — 99 Food e Keeta guardam a data do pedido, mas não o valor."
          : "."}
      </p>
    </div>
  )
}
