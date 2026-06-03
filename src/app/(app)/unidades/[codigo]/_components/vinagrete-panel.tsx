"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { fmtBRL } from "@/lib/format"
import type {
  VinagreteRef,
  CategoriaPreco,
} from "@/lib/data/produtos-vendidos"
import {
  importProdutosVendidos,
  saveCategoriaPreco,
  getCategoriaPrecosAction,
  deleteProdutosVendidos,
} from "../_actions"

function fmtDia(s: string): string {
  const [, m, d] = s.split("-")
  return `${d}/${m}`
}

const brl2 = (n: number) =>
  n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

function normCat(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

type Row = {
  categoria: string
  preco: number
  considerar: boolean
  quantidade: number | null
  soma: number | null
}

export function VinagretePanel({
  unitId,
  unitCode,
  inicio,
  fim,
  vinRef,
  onImported,
  onPrecoSaved,
  onUsar,
}: {
  unitId: string
  unitCode: string
  inicio: string
  fim: string
  vinRef: VinagreteRef | null
  onImported: (ref: VinagreteRef, inicio: string, fim: string) => void
  onPrecoSaved: () => void
  onUsar: (total: number) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(
    null,
  )
  const [precos, setPrecos] = React.useState<CategoriaPreco[]>([])
  const fileRef = React.useRef<HTMLInputElement>(null)

  // Carrega o cadastro de preços (independe de ter planilha importada).
  React.useEffect(() => {
    let alive = true
    getCategoriaPrecosAction(unitId).then((res) => {
      if (alive && res.ok && res.precos) setPrecos(res.precos)
    })
    return () => {
      alive = false
    }
  }, [unitId])

  async function reloadPrecos() {
    const res = await getCategoriaPrecosAction(unitId)
    if (res.ok && res.precos) setPrecos(res.precos)
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setMsg(null)
    const fd = new FormData()
    fd.append("unitId", unitId)
    fd.append("unitCode", unitCode)
    fd.append("file", file)
    const res = await importProdutosVendidos(fd)
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ""
    if (res.ok && res.ref && res.periodoInicio && res.periodoFim) {
      onImported(res.ref, res.periodoInicio, res.periodoFim)
      reloadPrecos() // pode ter criado preço pra categoria nova
      setOpen(true)
      setMsg({
        ok: true,
        text: `Planilha de ${fmtDia(res.periodoInicio)}–${fmtDia(res.periodoFim)} importada.`,
      })
    } else {
      setMsg({ ok: false, text: res.message ?? "Erro ao importar." })
    }
  }

  async function onRemover() {
    if (!inicio || !fim) return
    setBusy(true)
    setMsg(null)
    const res = await deleteProdutosVendidos(unitId, unitCode, inicio, fim)
    setBusy(false)
    if (res.ok) {
      onPrecoSaved() // re-busca a referência da semana (fica sem dados)
      setMsg({ ok: true, text: "Planilha removida. Pode importar a correta." })
    } else {
      setMsg({ ok: false, text: res.message ?? "Erro ao remover." })
    }
  }

  const temDados = !!vinRef?.temDados

  // Junta cadastro de preços + quantidades da semana (se houver).
  const weekMap = new Map(
    (vinRef?.linhas ?? []).map((l) => [normCat(l.categoria), l]),
  )
  const rows: Row[] = precos
    .map((p) => {
      const w = weekMap.get(normCat(p.categoria))
      return {
        categoria: p.categoria,
        preco: p.preco,
        considerar: p.considerar,
        quantidade: w ? w.quantidade : null,
        soma: w ? w.soma : null,
      }
    })
    .sort((a, b) => {
      const qa = a.quantidade ?? -1
      const qb = b.quantidade ?? -1
      if (qa !== qb) return qb - qa
      return a.categoria.localeCompare(b.categoria)
    })

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Vinagrete / bebidas pela planilha do JK
        </div>
        <div className="flex items-center gap-2">
          {precos.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {open ? "ocultar" : "ver / editar preços"}
            </button>
          )}
          {temDados && (
            <button
              type="button"
              onClick={onRemover}
              disabled={busy}
              className="text-[11px] text-rose-600 transition-colors hover:text-rose-700 disabled:opacity-50 dark:text-rose-400"
            >
              remover planilha
            </button>
          )}
          <label className="cursor-pointer rounded-md border border-input bg-background px-2 py-1 text-[11px] font-medium transition-colors hover:bg-muted">
            {busy
              ? "Aguarde..."
              : temDados
                ? "Trocar planilha (.xlsx)"
                : "Importar planilha (.xlsx)"}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={onFile}
              disabled={busy}
            />
          </label>
        </div>
      </div>

      {!temDados && (
        <p className="text-[10px] text-muted-foreground">
          Suba a planilha “Produtos vendidos” do JK da semana pra calcular o
          total (qtd × preço). Em “ver / editar preços” você ajusta os preços
          das categorias a qualquer momento.
        </p>
      )}

      {temDados && vinRef && (
        <>
          <div className="flex items-center justify-between rounded-md bg-primary/10 px-3 py-2">
            <span className="text-xs text-muted-foreground">
              Total calculado (qtd × preço)
            </span>
            <div className="flex items-center gap-2">
              <span className="font-semibold tabular-nums">
                {fmtBRL(vinRef.total)}
              </span>
              <button
                type="button"
                onClick={() => onUsar(vinRef.total)}
                className="rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                usar no campo
              </button>
            </div>
          </div>

          {vinRef.faltaPreco.length > 0 && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400">
              Sem preço (R$ 0,00): {vinRef.faltaPreco.join(", ")} — ajuste em
              “ver / editar preços”.
            </p>
          )}
        </>
      )}

      {open && rows.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[10px] text-muted-foreground">
                <th className="px-2 py-1.5 text-left font-medium">Categoria</th>
                <th className="px-2 py-1.5 text-right font-medium">Qtd</th>
                <th className="px-2 py-1.5 text-right font-medium">Preço</th>
                <th className="px-2 py-1.5 text-center font-medium">Conta?</th>
                <th className="px-2 py-1.5 text-right font-medium">Soma</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <PrecoRow
                  key={r.categoria}
                  row={r}
                  unitId={unitId}
                  unitCode={unitCode}
                  onSaved={() => {
                    reloadPrecos()
                    onPrecoSaved()
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {msg && (
        <p
          className={cn(
            "text-[10px]",
            msg.ok
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400",
          )}
        >
          {msg.text}
        </p>
      )}
    </div>
  )
}

function PrecoRow({
  row,
  unitId,
  unitCode,
  onSaved,
}: {
  row: Row
  unitId: string
  unitCode: string
  onSaved: () => void
}) {
  const [considerar, setConsiderar] = React.useState(row.considerar)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => setConsiderar(row.considerar), [row.considerar])

  async function commit(preco: number, cons: boolean) {
    setBusy(true)
    await saveCategoriaPreco({
      unitId,
      unitCode,
      categoria: row.categoria,
      preco,
      considerar: cons,
    })
    setBusy(false)
    onSaved()
  }

  return (
    <tr
      className={cn(
        "border-b last:border-0",
        !considerar && "opacity-50",
        busy && "animate-pulse",
      )}
    >
      <td className="px-2 py-1.5">{row.categoria}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
        {row.quantidade ?? "—"}
      </td>
      <td className="px-2 py-1.5 text-right">
        <PrecoInput
          value={row.preco}
          onCommit={(v) => commit(v, considerar)}
        />
      </td>
      <td className="px-2 py-1.5 text-center">
        <input
          type="checkbox"
          checked={considerar}
          onChange={(e) => {
            setConsiderar(e.target.checked)
            commit(row.preco, e.target.checked)
          }}
          className="size-3.5 accent-[var(--primary)]"
        />
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums font-medium">
        {row.soma != null ? fmtBRL(row.soma) : "—"}
      </td>
    </tr>
  )
}

/** Input de preço: digita números (centavos), confirma no blur/Enter. */
function PrecoInput({
  value,
  onCommit,
}: {
  value: number
  onCommit: (n: number) => void
}) {
  const [txt, setTxt] = React.useState(value ? brl2(value) : "")
  React.useEffect(() => setTxt(value ? brl2(value) : ""), [value])

  function commit() {
    const digits = txt.replace(/\D/g, "")
    const v = parseInt(digits || "0", 10) / 100
    if (v !== value) onCommit(v)
    else setTxt(value ? brl2(value) : "")
  }

  return (
    <input
      value={txt}
      inputMode="numeric"
      placeholder="0,00"
      onChange={(e) => setTxt(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
      }}
      className="w-16 rounded border border-input bg-background px-1.5 py-1 text-right tabular-nums outline-none focus:border-ring"
    />
  )
}
