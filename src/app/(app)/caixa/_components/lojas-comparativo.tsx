import Link from "next/link"
import { Store } from "lucide-react"

import { fmtBRL } from "@/lib/format"
import type { LojaResumo } from "@/lib/data/caixa"

export function LojasComparativo({ lojas, periodo }: { lojas: LojaResumo[]; periodo?: string }) {
  if (lojas.length <= 1) return null

  const total = lojas.reduce(
    (t, l) => ({
      saldo: t.saldo + l.saldo,
      recebido: t.recebido + l.recebido,
      pago: t.pago + l.pago,
      aReceber: t.aReceber + l.aReceber,
      aPagar: t.aPagar + l.aPagar,
      resultado: t.resultado + l.resultado,
    }),
    { saldo: 0, recebido: 0, pago: 0, aReceber: 0, aPagar: 0, resultado: 0 },
  )

  const href = (id: string | null) => {
    const p = new URLSearchParams()
    if (periodo) p.set("periodo", periodo)
    if (id) p.set("loja", id)
    const qs = p.toString()
    return qs ? `/caixa?${qs}` : "/caixa"
  }

  const Cell = ({ v, cls = "" }: { v: number; cls?: string }) => (
    <td className={`px-3 py-2.5 text-right tabular-nums ${cls}`}>{fmtBRL(v)}</td>
  )

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Store className="size-4 text-muted-foreground" />
          Comparativo por loja
        </h2>
        <span className="text-xs text-muted-foreground">
          {lojas.length} {lojas.length === 1 ? "loja" : "lojas"} · clique para abrir
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Loja</th>
              <th className="px-3 py-2 text-right font-medium">Saldo</th>
              <th className="px-3 py-2 text-right font-medium">Recebido</th>
              <th className="px-3 py-2 text-right font-medium">Pago</th>
              <th className="px-3 py-2 text-right font-medium">A receber</th>
              <th className="px-3 py-2 text-right font-medium">A pagar</th>
              <th className="px-4 py-2 text-right font-medium">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {lojas.map((l) => (
              <tr key={l.unitId ?? "rede"} className="border-b transition hover:bg-accent/50 last:border-0">
                <td className="px-4 py-2.5">
                  <Link href={href(l.unitId)} className="font-medium hover:underline">
                    {l.name}
                  </Link>
                </td>
                <Cell v={l.saldo} cls="font-medium" />
                <Cell v={l.recebido} cls="text-emerald-600" />
                <Cell v={l.pago} cls="text-rose-600" />
                <Cell v={l.aReceber} cls="text-emerald-500" />
                <Cell v={l.aPagar} cls="text-amber-600" />
                <td
                  className={`px-4 py-2.5 text-right font-semibold tabular-nums ${
                    l.resultado >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {fmtBRL(l.resultado)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-muted/40 font-semibold">
              <td className="px-4 py-2.5">Total da rede</td>
              <Cell v={total.saldo} />
              <Cell v={total.recebido} />
              <Cell v={total.pago} />
              <Cell v={total.aReceber} />
              <Cell v={total.aPagar} />
              <td
                className={`px-4 py-2.5 text-right tabular-nums ${
                  total.resultado >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {fmtBRL(total.resultado)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
