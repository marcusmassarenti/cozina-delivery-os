import Link from "next/link"

import { BrandLogo } from "@/components/brand-logo"
import { fmtBRLShort, fmtNum } from "@/lib/format"
import type { DiaSemanaLoja } from "@/lib/data/dia-semana"

/**
 * Mapa da semana: onde cada loja concentra e onde afunda.
 *
 * ⚠️ A PRIMEIRA VERSÃO COMPARAVA COM A REDE e estava errada pro que se lê
 * aqui. Dois problemas: respondia "onde a loja desvia do mercado" enquanto
 * quem olha procura "qual o melhor e o pior dia dela"; e as maiores lojas SÃO
 * a média da rede, então Jardins e Brooklin ficavam cinza de ponta a ponta —
 * o mapa esvaziava justo onde há mais dinheiro.
 *
 * Agora cada linha é a semana DAQUELA loja, normalizada por ela mesma. O
 * melhor dia é o verde mais forte, o pior o vermelho mais forte, e a
 * comparação com a rede continua existindo no bloco "Fogem do padrão", que é
 * o lugar certo pra ela.
 */
export function MapaCalor({
  linhas,
}: {
  linhas: {
    unit: { id: string; code: string; name: string; logo_url: string | null }
    d: DiaSemanaLoja
  }[]
}) {
  if (linhas.length === 0) return null
  const dias = linhas[0]!.d.dias

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold">Mapa da semana</h2>
      <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
        Cada linha é a semana de uma loja. O{" "}
        <span className="font-medium text-emerald-700 dark:text-emerald-400">
          verde forte
        </span>{" "}
        é o melhor dia dela e o{" "}
        <span className="font-medium text-rose-700 dark:text-rose-400">
          vermelho
        </span>{" "}
        o pior — quanto mais forte, maior a distância pro resto da semana.
      </p>

      <div className="overflow-x-auto pb-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="pb-2 pr-3 text-left font-medium">Loja</th>
              {dias.map((d) => (
                <th key={d.dow} className="px-1 pb-2 text-center font-medium">
                  {d.rotuloCurto}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ unit, d }) => {
              const val = (x: { valor: number; pedidos: number }) =>
                d.base === "valor" ? x.valor : x.pedidos
              const opera = d.dias.filter(
                (x) => !d.naoOpera.some((n) => n.dow === x.dow),
              )
              const max = Math.max(...opera.map(val), 1)
              const min = Math.min(...opera.map(val))
              return (
                <tr key={unit.id}>
                  <td className="py-1 pr-3">
                    <Link
                      href={`/unidades/${unit.code}`}
                      className="flex items-center gap-1.5 hover:underline"
                    >
                      <BrandLogo
                        size="sm"
                        logoUrl={unit.logo_url}
                        name={unit.name}
                      />
                      <span className="max-w-[170px] truncate font-medium">
                        {unit.name}
                      </span>
                      <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                        #{unit.code}
                      </span>
                    </Link>
                  </td>
                  {d.dias.map((x) => {
                    const fechado = d.naoOpera.some((n) => n.dow === x.dow)
                    // 0 = pior dia da loja, 1 = melhor. Normalizar pelo próprio
                    // intervalo é o que faz loja de R$ 5 mil e de R$ 500 mil
                    // ficarem legíveis na mesma tabela.
                    const t =
                      max > min ? (val(x) - min) / (max - min) : 0.5
                    return (
                      <td key={x.dow} className="px-1 py-1">
                        <span
                          title={
                            fechado
                              ? `${unit.name} · ${x.rotulo}: não abre`
                              : `${unit.name} · ${x.rotulo}: ${
                                  d.base === "valor"
                                    ? fmtBRLShort(x.valor)
                                    : `${fmtNum(x.pedidos)} pedidos`
                                }`
                          }
                          className={`flex h-7 items-center justify-center rounded text-[10px] font-semibold ${cor(t, fechado)}`}
                        >
                          {fechado
                            ? "—"
                            : d.base === "valor"
                              ? fmtBRLShort(x.valor)
                              : fmtNum(x.pedidos)}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="inline-block h-4 w-6 rounded border bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,var(--color-border)_3px,var(--color-border)_5px)]" />
        listrado com traço = a loja não abre nesse dia (ou vende quase nada).
      </p>
    </section>
  )
}

/**
 * `t` vai de 0 (pior dia da loja) a 1 (melhor). Cinco faixas, não gradiente:
 * o olho não distingue 0,52 de 0,58, e fingir essa precisão faz ler diferença
 * onde não há.
 */
function cor(t: number, fechado: boolean): string {
  if (fechado)
    return "border bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,var(--color-border)_3px,var(--color-border)_5px)] text-muted-foreground/50"
  if (t >= 0.85) return "bg-emerald-600 text-white"
  if (t >= 0.6) return "bg-emerald-500/45 text-emerald-950 dark:text-emerald-50"
  if (t >= 0.35) return "bg-muted-foreground/15 text-muted-foreground"
  if (t >= 0.15) return "bg-rose-400/45 text-rose-950 dark:text-rose-50"
  return "bg-rose-600 text-white"
}
