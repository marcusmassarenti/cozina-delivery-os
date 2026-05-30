"use client"

import { useEffect, useState } from "react"
import { Check, Loader2, Pencil } from "lucide-react"
import { useRouter } from "next/navigation"

import type { ResultadoUnitRow, ResultadoTotals } from "@/lib/data/resultado"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"

import { saveUnitCosts } from "../_actions"

type Vals = { cozina: number; operacao: number }
type SaveStatus = "saving" | "saved" | "error" | null

/**
 * Tabela ranking por unidade do DRE — agora com edição inline dos custos
 * manuais (Custo Cozina + Custo da operação). Clica na célula, digita
 * (máscara de centavos), sai do campo → salva. O Resultado da linha e o
 * TOTAL recalculam na hora; o resto do DRE atualiza no refresh.
 *
 * A linha continua clicável pro detalhe da unidade — só as células de
 * custo param a propagação pra não navegar enquanto se edita.
 */
export function ResultadoTable({
  rows,
  totals,
  periodo,
  year,
  month,
}: {
  rows: ResultadoUnitRow[]
  totals: ResultadoTotals
  periodo?: string
  year: number
  month: number
}) {
  const router = useRouter()
  const href = (code: string) =>
    `/unidades/${code}${periodo ? `?periodo=${periodo}` : ""}`

  // Overrides locais por unidade (otimista). Resetam ao trocar de período.
  const [edits, setEdits] = useState<Record<string, Vals>>({})
  const [status, setStatus] = useState<Record<string, SaveStatus>>({})
  useEffect(() => {
    setEdits({})
    setStatus({})
  }, [year, month])

  const valsOf = (r: ResultadoUnitRow): Vals =>
    edits[r.unitId] ?? { cozina: r.cmvCozina, operacao: r.custoOperacao }

  // Resultado vivo da linha = líquido − (cozina editado + loja legado) − operação
  const resultadoOf = (r: ResultadoUnitRow) => {
    const v = valsOf(r)
    return r.totalLiquido - (v.cozina + r.cmvLoja) - v.operacao
  }
  const pctOf = (r: ResultadoUnitRow) => {
    const res = resultadoOf(r)
    return r.bruto > 0 ? (res / r.bruto) * 100 : 0
  }

  const setVal = (r: ResultadoUnitRow, key: keyof Vals, n: number) => {
    const cur = valsOf(r)
    setEdits((p) => ({ ...p, [r.unitId]: { ...cur, [key]: n } }))
  }

  const save = async (r: ResultadoUnitRow) => {
    const v = valsOf(r)
    if (v.cozina === r.cmvCozina && v.operacao === r.custoOperacao) return
    setStatus((p) => ({ ...p, [r.unitId]: "saving" }))
    const res = await saveUnitCosts({
      unitId: r.unitId,
      year,
      month,
      custoCozina: v.cozina,
      custoOperacao: v.operacao,
    })
    if (res.ok) {
      setStatus((p) => ({ ...p, [r.unitId]: "saved" }))
      router.refresh()
      setTimeout(
        () => setStatus((p) => ({ ...p, [r.unitId]: null })),
        1500,
      )
    } else {
      setStatus((p) => ({ ...p, [r.unitId]: "error" }))
    }
  }

  // Totais vivos (refletem os custos editados antes do refresh)
  const liveCozina = rows.reduce((a, r) => a + valsOf(r).cozina, 0)
  const liveOperacao = rows.reduce((a, r) => a + valsOf(r).operacao, 0)
  const liveResultado = rows.reduce((a, r) => a + resultadoOf(r), 0)
  const livePct = totals.bruto > 0 ? (liveResultado / totals.bruto) * 100 : 0
  const algumCusto = liveCozina > 0 || liveOperacao > 0

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Resultado por unidade</h3>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Pencil className="size-3" />
            clique em <span className="font-medium">Custo Cozina</span> ou{" "}
            <span className="font-medium">Custo operação</span> pra editar
          </p>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {rows.length} loja{rows.length !== 1 ? "s" : ""} · ordenado por bruto
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Unidade</th>
              <th className="px-3 py-2 text-right font-semibold">Pedidos</th>
              <th className="px-3 py-2 text-right font-semibold">Bruto</th>
              <th className="px-3 py-2 text-right font-semibold">Líquido</th>
              <th className="px-3 py-2 text-right font-semibold">
                Custo Cozina
              </th>
              <th className="px-3 py-2 text-right font-semibold">
                Custo operação
              </th>
              <th className="px-3 py-2 text-right font-semibold">Resultado</th>
              <th className="px-3 py-2 text-right font-semibold">%</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const v = valsOf(r)
              const res = resultadoOf(r)
              const st = status[r.unitId] ?? null
              return (
                <tr
                  key={r.unitId}
                  onClick={() => router.push(href(r.unitCode))}
                  className="cursor-pointer hover:bg-muted/40"
                >
                  <td className="px-3 py-2">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      #{r.unitCode}
                    </span>{" "}
                    <span className="font-medium">{r.unitName}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtNum(r.pedidos)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {fmtBRL(r.bruto)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtBRL(r.totalLiquido)}
                  </td>
                  <CostCell
                    value={v.cozina}
                    onChange={(n) => setVal(r, "cozina", n)}
                    onCommit={() => save(r)}
                  />
                  <CostCell
                    value={v.operacao}
                    onChange={(n) => setVal(r, "operacao", n)}
                    onCommit={() => save(r)}
                  />
                  <td
                    className={`px-3 py-2 text-right font-semibold tabular-nums ${
                      res >= 0
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-rose-700 dark:text-rose-400"
                    }`}
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      {st === "saving" && (
                        <Loader2 className="size-3 animate-spin text-muted-foreground" />
                      )}
                      {st === "saved" && (
                        <Check className="size-3 text-emerald-600" />
                      )}
                      {st === "error" && (
                        <span className="text-[9px] text-rose-600">erro</span>
                      )}
                      {fmtBRL(res)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {v.cozina > 0 || v.operacao > 0 ? (
                      fmtPct(pctOf(r))
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-muted/30 font-semibold">
              <td className="px-3 py-2.5">TOTAL · rede</td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {fmtNum(totals.pedidos)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {fmtBRL(totals.bruto)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {fmtBRL(totals.totalLiquido)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-rose-700 dark:text-rose-400">
                {liveCozina > 0 ? `− ${fmtBRL(liveCozina)}` : "—"}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-rose-700 dark:text-rose-400">
                {liveOperacao > 0 ? `− ${fmtBRL(liveOperacao)}` : "—"}
              </td>
              <td
                className={`px-3 py-2.5 text-right tabular-nums ${
                  liveResultado >= 0
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-rose-700 dark:text-rose-400"
                }`}
              >
                {fmtBRL(liveResultado)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {algumCusto ? fmtPct(livePct) : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

/**
 * Célula de custo editável. Máscara de moeda (dígitos = centavos, igual ao
 * lançamento mensal). Para a propagação pra não navegar pro detalhe.
 */
function CostCell({
  value,
  onChange,
  onCommit,
}: {
  value: number
  onChange: (n: number) => void
  onCommit: () => void
}) {
  const display =
    value === 0
      ? ""
      : value.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
  return (
    <td
      className="px-1.5 py-1 text-right"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="text"
        inputMode="numeric"
        value={display}
        placeholder="0,00"
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "")
          const cents = parseInt(digits || "0", 10)
          onChange(cents / 100)
        }}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
        }}
        className="w-24 rounded border border-transparent bg-transparent px-1.5 py-1 text-right tabular-nums placeholder:text-muted-foreground/40 hover:border-border focus:border-ring focus:bg-background focus:outline-none"
      />
    </td>
  )
}
