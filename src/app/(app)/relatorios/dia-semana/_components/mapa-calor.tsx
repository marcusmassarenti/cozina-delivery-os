import Link from "next/link"

import { BrandLogo } from "@/components/brand-logo"
import { fmtBRLShort, fmtNum } from "@/lib/format"
import type { DiaSemanaLoja } from "@/lib/data/dia-semana"

/**
 * Mapa de calor loja × dia da semana.
 *
 * É a tese do relatório desenhada: coluna inteira escura significa que a rede
 * toda cai naquele dia — mercado, não há o que corrigir. Uma célula escura
 * sozinha numa linha é problema DAQUELA loja.
 *
 * A cor é o ÍNDICE contra a rede, não o valor absoluto: 1,0 = a loja vende
 * naquele dia a mesma fatia da própria semana que a rede vende. Sem isso,
 * loja grande ficaria escura inteira e loja pequena clara inteira, e o mapa
 * viraria um ranking de tamanho — que a tabela ao lado já dá.
 *
 * Dia em que a loja não opera fica HACHURADO, não vermelho: fechar segunda é
 * decisão, não falha, e pintar de vermelho faria a tela pedir uma correção
 * que não existe.
 */
export function MapaCalor({
  linhas,
  shareRede,
}: {
  linhas: {
    unit: { id: string; code: string; name: string; logo_url: string | null }
    d: DiaSemanaLoja
  }[]
  shareRede: Map<number, number>
}) {
  if (linhas.length === 0) return null
  const dias = linhas[0]!.d.dias

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold">Mapa da semana</h2>
      <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
        Cada célula compara a loja com a rede naquele dia.{" "}
        <span className="font-medium text-rose-700 dark:text-rose-400">
          Vermelho
        </span>{" "}
        = vende bem menos que a rede vende nesse dia;{" "}
        <span className="font-medium text-emerald-700 dark:text-emerald-400">
          verde
        </span>{" "}
        = bem mais. Coluna toda vermelha é o mercado, não a loja.
      </p>

      <div className="overflow-x-auto pb-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="pb-2 pr-3 text-left font-medium">Loja</th>
              {dias.map((d) => (
                <th key={d.dow} className="pb-2 px-1 text-center font-medium">
                  {d.rotuloCurto}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ unit, d }) => {
              const total = d.dias.reduce(
                (s, x) => s + (d.base === "valor" ? x.valor : x.pedidos),
                0,
              )
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
                      <span className="max-w-[180px] truncate font-medium">
                        {unit.name}
                      </span>
                    </Link>
                  </td>
                  {d.dias.map((x) => {
                    const naoOpera = d.naoOpera.some((n) => n.dow === x.dow)
                    const v = d.base === "valor" ? x.valor : x.pedidos
                    const shareLoja = total > 0 ? (v / total) * 100 : 0
                    const shareR = shareRede.get(x.dow) ?? 100 / 7
                    const indice = shareR > 0 ? shareLoja / shareR : 1
                    return (
                      <td key={x.dow} className="px-1 py-1">
                        <span
                          title={
                            naoOpera
                              ? `${unit.name} · ${x.rotulo}: não opera`
                              : `${unit.name} · ${x.rotulo}: ${
                                  d.base === "valor"
                                    ? fmtBRLShort(x.valor)
                                    : `${fmtNum(x.pedidos)} pedidos`
                                } · ${Math.round(indice * 100)}% do padrão da rede`
                          }
                          className={`block h-6 rounded ${cor(indice, naoOpera)}`}
                        />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-1 text-[11px] text-muted-foreground">
        Hachurado = a loja não opera nesse dia.
      </p>
    </section>
  )
}

/**
 * Cinco faixas, não gradiente contínuo: o olho não distingue 1,02 de 1,08, e
 * fingir essa precisão faria ler diferença onde não há.
 */
function cor(indice: number, naoOpera: boolean): string {
  if (naoOpera)
    return "bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,var(--color-border)_3px,var(--color-border)_5px)] border"
  if (indice < 0.6) return "bg-rose-600"
  if (indice < 0.85) return "bg-rose-400/70"
  if (indice <= 1.15) return "bg-muted-foreground/20"
  if (indice <= 1.4) return "bg-emerald-400/70"
  return "bg-emerald-600"
}
