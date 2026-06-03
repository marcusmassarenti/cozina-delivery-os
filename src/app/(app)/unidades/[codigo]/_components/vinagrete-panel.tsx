"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { fmtBRL } from "@/lib/format"
import type {
  VinagreteRef,
  ProdutoPreco,
  EmbalagemLinha,
} from "@/lib/data/produtos-vendidos"
import {
  importProdutosVendidos,
  saveCategoriaPrecoGroup,
  assignProdutoCategoria,
  saveEmbalagem,
  getProdutoPrecosAction,
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

const limpaNome = (s: string) => s.replace(/\s+/g, " ").trim()

type CatRow = {
  categoria: string
  preco: number
  considerar: boolean
  quantidade: number | null
  soma: number | null
}

type SemCat = { codigo: string; descricao: string; quantidade: number }

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
  const [precos, setPrecos] = React.useState<ProdutoPreco[]>([])
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
  const fileRef = React.useRef<HTMLInputElement>(null)

  function toggleCat(c: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })
  }

  React.useEffect(() => {
    let alive = true
    getProdutoPrecosAction(unitId).then((res) => {
      if (alive && res.ok && res.precos) setPrecos(res.precos)
    })
    return () => {
      alive = false
    }
  }, [unitId])

  async function reloadPrecos() {
    const res = await getProdutoPrecosAction(unitId)
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
      reloadPrecos()
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
      onPrecoSaved()
      setMsg({ ok: true, text: "Planilha removida. Pode importar a correta." })
    } else {
      setMsg({ ok: false, text: res.message ?? "Erro ao remover." })
    }
  }

  function afterSaved() {
    reloadPrecos()
    onPrecoSaved()
  }

  const temDados = !!vinRef?.temDados

  // categorias do cadastro (preço/considerar representativos)
  const catInfo = new Map<string, { preco: number; considerar: boolean }>()
  for (const p of precos) {
    if (!p.categoria) continue
    const g = catInfo.get(p.categoria) ?? { preco: 0, considerar: p.considerar }
    if (g.preco === 0 && p.preco > 0) g.preco = p.preco
    catInfo.set(p.categoria, g)
  }
  const categoriasDisponiveis = [...catInfo.keys()].sort((a, b) =>
    a.localeCompare(b),
  )

  // quantidades/soma da semana, por categoria; e os produtos sem categoria
  const weekCat = new Map<string, { qtd: number; soma: number }>()
  const semCategoria: SemCat[] = []
  for (const l of vinRef?.linhas ?? []) {
    if (!l.categoria) {
      semCategoria.push({
        codigo: l.codigo,
        descricao: l.descricao,
        quantidade: l.quantidade,
      })
      continue
    }
    const g = weekCat.get(l.categoria) ?? { qtd: 0, soma: 0 }
    g.qtd += l.quantidade
    g.soma += l.soma
    weekCat.set(l.categoria, g)
  }
  semCategoria.sort((a, b) => b.quantidade - a.quantidade)

  // qtd da semana por código (pra mostrar ao expandir uma categoria)
  const weekByCod = new Map((vinRef?.linhas ?? []).map((l) => [l.codigo, l]))
  function produtosDaCategoria(categoria: string) {
    return precos
      .filter((p) => p.categoria === categoria)
      .map((p) => ({
        codigo: p.codigo,
        descricao: p.descricao || weekByCod.get(p.codigo)?.descricao || p.codigo,
        quantidade: weekByCod.get(p.codigo)?.quantidade ?? null,
      }))
      .sort(
        (a, b) =>
          (b.quantidade ?? -1) - (a.quantidade ?? -1) ||
          limpaNome(a.descricao).localeCompare(limpaNome(b.descricao)),
      )
  }

  const catRows: CatRow[] = [...catInfo.entries()]
    .map(([categoria, info]) => {
      const w = weekCat.get(categoria)
      return {
        categoria,
        preco: info.preco,
        considerar: info.considerar,
        quantidade: w ? w.qtd : null,
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
          {catRows.length > 0 && (
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
          Suba a planilha “Produtos vendidos” do JK da semana — o sistema soma
          por categoria × preço. Em “ver / editar preços” você ajusta os preços
          das categorias a qualquer momento.
        </p>
      )}

      {temDados && vinRef && (
        <>
          <div className="flex flex-col gap-1 rounded-md bg-primary/10 px-3 py-2">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Produtos (qtd × preço)</span>
              <span className="tabular-nums">{fmtBRL(vinRef.total)}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Embalagem ({vinRef.poteCount} potes)</span>
              <span className="tabular-nums">{fmtBRL(vinRef.embalagemTotal)}</span>
            </div>
            <div className="flex items-center justify-between border-t pt-1">
              <span className="text-xs font-medium">Total</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold tabular-nums">
                  {fmtBRL(vinRef.totalGeral)}
                </span>
                <button
                  type="button"
                  onClick={() => onUsar(vinRef.totalGeral)}
                  className="rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  usar no campo
                </button>
              </div>
            </div>
          </div>

          {semCategoria.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-950/30">
              <div className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
                {semCategoria.length} produto(s) sem categoria — escolha a
                categoria (não entram na conta enquanto isso):
              </div>
              <div className="mt-1 flex flex-col gap-1">
                {semCategoria.map((s) => (
                  <SemCategoriaRow
                    key={s.codigo}
                    item={s}
                    unitId={unitId}
                    unitCode={unitCode}
                    categorias={categoriasDisponiveis}
                    onSaved={afterSaved}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {open && catRows.length > 0 && (
        <div className="max-h-80 overflow-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="border-b bg-muted text-[10px] text-muted-foreground">
                <th className="px-2 py-1.5 text-left font-medium">Categoria</th>
                <th className="px-2 py-1.5 text-right font-medium">Qtd</th>
                <th className="px-2 py-1.5 text-right font-medium">Preço</th>
                <th className="px-2 py-1.5 text-center font-medium">Conta?</th>
                <th className="px-2 py-1.5 text-right font-medium">Soma</th>
              </tr>
            </thead>
            <tbody>
              {catRows.map((r) => (
                <React.Fragment key={r.categoria}>
                  <CategoriaRow
                    row={r}
                    expanded={expanded.has(r.categoria)}
                    onToggle={() => toggleCat(r.categoria)}
                    unitId={unitId}
                    unitCode={unitCode}
                    onSaved={afterSaved}
                  />
                  {expanded.has(r.categoria) &&
                    produtosDaCategoria(r.categoria).map((p) => (
                      <ProdutoMoverRow
                        key={p.codigo}
                        produto={p}
                        atual={r.categoria}
                        categorias={categoriasDisponiveis}
                        unitId={unitId}
                        unitCode={unitCode}
                        onSaved={afterSaved}
                      />
                    ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && vinRef && vinRef.embalagem.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted text-[10px] text-muted-foreground">
                <th className="px-2 py-1.5 text-left font-medium">Embalagem</th>
                <th className="px-2 py-1.5 text-right font-medium">Qtd</th>
                <th className="px-2 py-1.5 text-right font-medium">Preço</th>
                <th className="px-2 py-1.5 text-right font-medium">Soma</th>
              </tr>
            </thead>
            <tbody>
              {vinRef.embalagem.map((e) => (
                <EmbalagemRow
                  key={e.id}
                  item={e}
                  unitId={unitId}
                  unitCode={unitCode}
                  onSaved={afterSaved}
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

function CategoriaRow({
  row,
  expanded,
  onToggle,
  unitId,
  unitCode,
  onSaved,
}: {
  row: CatRow
  expanded: boolean
  onToggle: () => void
  unitId: string
  unitCode: string
  onSaved: () => void
}) {
  const [considerar, setConsiderar] = React.useState(row.considerar)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => setConsiderar(row.considerar), [row.considerar])

  async function commit(preco: number, cons: boolean) {
    setBusy(true)
    await saveCategoriaPrecoGroup({
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
      <td className="px-2 py-1.5">
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex items-center gap-1 text-left hover:text-primary"
          title="Ver/mover produtos desta categoria"
        >
          <span className="text-[8px] text-muted-foreground">
            {expanded ? "▼" : "▶"}
          </span>
          {row.categoria}
        </button>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
        {row.quantidade ?? "—"}
      </td>
      <td className="px-2 py-1.5 text-right">
        <PrecoInput value={row.preco} onCommit={(v) => commit(v, considerar)} />
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

function SemCategoriaRow({
  item,
  unitId,
  unitCode,
  categorias,
  onSaved,
}: {
  item: SemCat
  unitId: string
  unitCode: string
  categorias: string[]
  onSaved: () => void
}) {
  const [busy, setBusy] = React.useState(false)
  // null = escolhendo no select; string = digitando nova categoria
  const [nova, setNova] = React.useState<string | null>(null)

  async function assign(categoria: string) {
    const c = categoria.trim()
    if (!c) return
    setBusy(true)
    await assignProdutoCategoria({
      unitId,
      unitCode,
      codigo: item.codigo,
      descricao: item.descricao,
      categoria: c,
    })
    setBusy(false)
    onSaved()
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 text-[11px]",
        busy && "animate-pulse",
      )}
    >
      <span className="min-w-0 flex-1 truncate">
        {limpaNome(item.descricao)}{" "}
        <span className="text-muted-foreground">({item.quantidade})</span>
      </span>
      {nova === null ? (
        <select
          value=""
          disabled={busy}
          onChange={(e) => {
            const v = e.target.value
            if (v === "__nova__") setNova("")
            else if (v) assign(v)
          }}
          className="rounded border border-input bg-background px-1.5 py-1 text-[11px] outline-none focus:border-ring"
        >
          <option value="" disabled>
            categoria…
          </option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value="__nova__">+ nova categoria…</option>
        </select>
      ) : (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={nova}
            disabled={busy}
            placeholder="nome da categoria"
            onChange={(e) => setNova(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") assign(nova)
              if (e.key === "Escape") setNova(null)
            }}
            className="w-32 rounded border border-input bg-background px-1.5 py-1 text-[11px] outline-none focus:border-ring"
          />
          <button
            type="button"
            disabled={busy || !nova.trim()}
            onClick={() => assign(nova)}
            className="rounded bg-primary px-1.5 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
          >
            criar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setNova(null)}
            className="px-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}

function ProdutoMoverRow({
  produto,
  atual,
  categorias,
  unitId,
  unitCode,
  onSaved,
}: {
  produto: { codigo: string; descricao: string; quantidade: number | null }
  atual: string
  categorias: string[]
  unitId: string
  unitCode: string
  onSaved: () => void
}) {
  const [busy, setBusy] = React.useState(false)

  async function mover(categoria: string) {
    if (!categoria || categoria === atual) return
    setBusy(true)
    await assignProdutoCategoria({
      unitId,
      unitCode,
      codigo: produto.codigo,
      descricao: produto.descricao,
      categoria,
    })
    setBusy(false)
    onSaved()
  }

  return (
    <tr
      className={cn(
        "border-b border-dashed bg-muted/20 last:border-0",
        busy && "animate-pulse",
      )}
    >
      <td className="py-1 pl-6 pr-2 text-[11px] text-muted-foreground">
        {limpaNome(produto.descricao)}
      </td>
      <td className="px-2 py-1 text-right text-[11px] tabular-nums text-muted-foreground">
        {produto.quantidade ?? "—"}
      </td>
      <td colSpan={3} className="px-2 py-1 text-right">
        <select
          value=""
          disabled={busy}
          onChange={(e) => mover(e.target.value)}
          className="rounded border border-input bg-background px-1 py-0.5 text-[10px] outline-none focus:border-ring"
        >
          <option value="" disabled>
            mover p/…
          </option>
          {categorias
            .filter((c) => c !== atual)
            .map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
        </select>
      </td>
    </tr>
  )
}

function EmbalagemRow({
  item,
  unitId,
  unitCode,
  onSaved,
}: {
  item: EmbalagemLinha
  unitId: string
  unitCode: string
  onSaved: () => void
}) {
  const [busy, setBusy] = React.useState(false)

  async function save(preco: number, qtdFixa: number) {
    setBusy(true)
    await saveEmbalagem({ unitId, unitCode, id: item.id, preco, qtdFixa })
    setBusy(false)
    onSaved()
  }

  return (
    <tr className={cn("border-b last:border-0", busy && "animate-pulse")}>
      <td className="px-2 py-1.5">
        {item.nome}
        {item.porPote && (
          <span className="text-[9px] text-muted-foreground"> · por pote</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
        {item.porPote ? (
          item.quantidade
        ) : (
          <DecimalInput
            value={item.qtdFixa}
            onCommit={(q) => save(item.preco, q)}
          />
        )}
      </td>
      <td className="px-2 py-1.5 text-right">
        <DecimalInput value={item.preco} onCommit={(p) => save(p, item.qtdFixa)} />
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums font-medium">
        {fmtBRL(item.soma)}
      </td>
    </tr>
  )
}

/** Input decimal livre (aceita até 4 casas, ex.: 0,0018) — pro preço da embalagem. */
function DecimalInput({
  value,
  onCommit,
}: {
  value: number
  onCommit: (n: number) => void
}) {
  const fmt = (n: number) => (n ? String(n).replace(".", ",") : "")
  const [txt, setTxt] = React.useState(fmt(value))
  React.useEffect(() => setTxt(fmt(value)), [value])

  function commit() {
    const v = parseFloat(txt.trim().replace(",", "."))
    const next = Number.isFinite(v) ? v : 0
    if (next !== value) onCommit(next)
    else setTxt(fmt(value))
  }

  return (
    <input
      value={txt}
      inputMode="decimal"
      placeholder="0"
      onChange={(e) => setTxt(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
      }}
      className="w-16 rounded border border-input bg-background px-1.5 py-1 text-right tabular-nums outline-none focus:border-ring"
    />
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
