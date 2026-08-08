import { FileText } from "lucide-react"

import { fmtBRL } from "@/lib/format"
import { getCaixaHoldingId, getCaixaUnits } from "@/lib/data/caixa"
import { getInsumos, getNotas } from "@/lib/data/nf"

import { NfImport } from "./_components/nf-import"
import { InsumosList } from "./_components/insumos-list"

export default async function NotasPage() {
  const holdingId = await getCaixaHoldingId()
  if (!holdingId) return null

  const [units, notas, insumos] = await Promise.all([
    getCaixaUnits(),
    getNotas(holdingId),
    getInsumos(holdingId),
  ])

  return (
    <div className="flex flex-col gap-4">
      <NfImport units={units} />

      <InsumosList insumos={insumos} />

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="size-4 text-muted-foreground" />
            Notas importadas
          </h2>
          <span className="text-xs text-muted-foreground">
            {notas.length} {notas.length === 1 ? "nota" : "notas"}
          </span>
        </div>
        {notas.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhuma nota importada ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">Nota</th>
                  <th className="px-3 py-2 text-left font-medium">Emissão</th>
                  <th className="px-3 py-2 text-left font-medium">Fornecedor</th>
                  <th className="px-3 py-2 text-left font-medium">Loja</th>
                  <th className="px-3 py-2 text-right font-medium">Itens</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {notas.map((n) => (
                  <tr key={n.id} className="border-b transition last:border-0 hover:bg-accent/40">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">nº {n.numero ?? "—"}</div>
                      {/* Chave completa no title: é o que se usa pra achar a
                          nota no portal da SEFAZ. */}
                      <div
                        className="text-[11px] text-muted-foreground"
                        title={n.chave}
                      >
                        …{n.chave.slice(-8)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {n.emissao ? fmtData(n.emissao) : "—"}
                    </td>
                    <td className="px-3 py-2.5">{n.emitNome ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      {n.unitNome ?? (
                        <span className="text-amber-600">sem loja</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {n.itens}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                      {fmtBRL(n.valorTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function fmtData(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}
