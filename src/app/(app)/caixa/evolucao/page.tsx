import { TrendingUp } from "lucide-react"

import { getEvolucaoCaixa, type EvolMes } from "@/lib/data/caixa"
import { fmtBRL, fmtBRLShort } from "@/lib/format"

const MES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

/** Barras receita × despesa + linha de resultado. */
function EvolChart({ dados }: { dados: EvolMes[] }) {
  const max = Math.max(1, ...dados.map((d) => Math.max(d.receita, d.despesa)))
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2" style={{ height: 180 }}>
        {dados.map((d) => (
          <div key={d.ym} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full flex-1 items-end justify-center gap-0.5">
              <div
                className="w-2.5 rounded-t bg-emerald-500"
                style={{ height: `${Math.max(d.receita > 0 ? 3 : 0, (d.receita / max) * 100)}%` }}
                title={`Receita: ${fmtBRL(d.receita)}`}
              />
              <div
                className="w-2.5 rounded-t bg-rose-500"
                style={{ height: `${Math.max(d.despesa > 0 ? 3 : 0, (d.despesa / max) * 100)}%` }}
                title={`Despesa: ${fmtBRL(d.despesa)}`}
              />
            </div>
            <span className="text-[9px] text-muted-foreground">{MES_ABREV[d.month - 1]}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-emerald-500" /> Receita</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-rose-500" /> Despesa</span>
      </div>
    </div>
  )
}

export default async function EvolucaoPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string }>
}) {
  const { loja } = await searchParams
  const dados = await getEvolucaoCaixa(12, loja)

  const totalReceita = dados.reduce((s, d) => s + d.receita, 0)
  const totalDespesa = dados.reduce((s, d) => s + d.despesa, 0)
  const totalResultado = totalReceita - totalDespesa
  const comDados = dados.filter((d) => d.receita > 0 || d.despesa > 0).length
  const mediaResultado = comDados > 0 ? totalResultado / comDados : 0

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <TrendingUp className="size-5 text-primary" />
          Evolução mês a mês
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Receita, despesa e resultado dos últimos 12 meses (por competência).
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <div className="text-[11px] font-medium text-muted-foreground">Receita (12m)</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-600">{fmtBRL(totalReceita)}</div>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <div className="text-[11px] font-medium text-muted-foreground">Despesa (12m)</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums text-rose-600">{fmtBRL(totalDespesa)}</div>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <div className="text-[11px] font-medium text-muted-foreground">Resultado médio / mês</div>
          <div className={`mt-0.5 text-lg font-semibold tabular-nums ${mediaResultado < 0 ? "text-rose-600" : "text-emerald-600"}`}>
            {fmtBRL(mediaResultado)}
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold">Receita × Despesa</p>
        <EvolChart dados={dados} />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-semibold">Mês</th>
                <th className="px-4 py-2 text-right font-semibold">Receita</th>
                <th className="px-4 py-2 text-right font-semibold">Despesa</th>
                <th className="px-4 py-2 text-right font-semibold">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {dados.map((d) => (
                <tr key={d.ym} className="border-b last:border-0">
                  <td className="px-4 py-2 text-xs">{MES_ABREV[d.month - 1]}/{String(d.year).slice(2)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-600">{d.receita > 0 ? fmtBRLShort(d.receita) : "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-rose-600">{d.despesa > 0 ? fmtBRLShort(d.despesa) : "—"}</td>
                  <td className={`px-4 py-2 text-right font-semibold tabular-nums ${d.resultado < 0 ? "text-rose-600" : d.resultado > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {d.receita > 0 || d.despesa > 0 ? fmtBRL(d.resultado) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
