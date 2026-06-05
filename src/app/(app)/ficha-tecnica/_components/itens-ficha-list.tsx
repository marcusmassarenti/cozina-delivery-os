"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronDown, Loader2, Plus, Save, Trash2, X } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { fmtNum } from "@/lib/format"
import { removeItemFicha, setItemFicha } from "../_actions"
import type { Insumo, ItemVendido } from "@/lib/data/producao"

type Linha = { codigo: string; qtd: number }

/**
 * Itens vendidos → insumos, em 1 etapa: abre o item e escolhe os insumos que
 * ele consome (com quantidade por unidade vendida). O "prato" intermediário é
 * criado por trás automaticamente.
 */
export function ItensFichaList({
  itens,
  insumos,
}: {
  itens: ItemVendido[]
  insumos: Insumo[]
}) {
  const [soPendentes, setSoPendentes] = React.useState(true)
  const semFicha = itens.filter((i) => i.ficha.length === 0).length
  const lista = soPendentes
    ? itens.filter((i) => i.ficha.length === 0)
    : itens

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Itens vendidos → insumos</h3>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {semFicha} sem ficha
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={soPendentes}
            onChange={(e) => setSoPendentes(e.target.checked)}
          />
          só sem ficha
        </label>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Abra um item e escolha os insumos que ele consome, com a quantidade por
        unidade vendida. É o que vira a demanda de produção.
      </p>

      {insumos.length === 0 ? (
        <p className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Cadastre os insumos no catálogo acima primeiro — eles aparecem no
          seletor de cada item.
        </p>
      ) : lista.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          {soPendentes ? "Todos os itens com ficha 🎉" : "Sem itens no mês."}
        </p>
      ) : (
        <div className="space-y-2">
          {lista.map((it) => (
            <ItemCard
              key={`${it.platform}|${it.nomeItem}`}
              item={it}
              insumos={insumos}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ItemCard({
  item,
  insumos,
}: {
  item: ItemVendido
  insumos: Insumo[]
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [linhas, setLinhas] = React.useState<Linha[]>(
    item.ficha.length
      ? item.ficha.map((f) => ({ codigo: f.insumoCodigo, qtd: f.qtd }))
      : [{ codigo: "", qtd: 1 }],
  )
  const [pending, start] = React.useTransition()
  const [msg, setMsg] = React.useState<string | null>(null)
  const temFicha = item.ficha.length > 0

  const setLinha = (i: number, patch: Partial<Linha>) =>
    setLinhas((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const addLinha = () => setLinhas((arr) => [...arr, { codigo: "", qtd: 1 }])
  const delLinha = (i: number) =>
    setLinhas((arr) => (arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr))

  const salvar = () => {
    start(async () => {
      const res = await setItemFicha({
        platform: item.platform,
        nomeItem: item.nomeItem,
        linhas: linhas.filter((l) => l.codigo && l.qtd > 0),
      })
      setMsg(res.message ?? (res.ok ? "Salvo." : "Erro."))
      if (res.ok) router.refresh()
    })
  }
  const remover = () => {
    start(async () => {
      const res = await removeItemFicha({
        platform: item.platform,
        nomeItem: item.nomeItem,
      })
      if (res.ok) router.refresh()
      else setMsg(res.message ?? "Erro")
    })
  }

  return (
    <details
      className="group rounded-lg border"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        <PlatformLogo platform={item.platform} size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm" title={item.nomeItem}>
          {item.nomeItem}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {fmtNum(item.qtd)} un
        </span>
        {temFicha ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <Check className="size-3" /> {item.ficha.length} insumo(s)
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            sem ficha
          </span>
        )}
      </summary>

      {open && (
        <div className="border-t px-3 py-3">
          <div className="space-y-1.5">
            {linhas.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={l.codigo}
                  onChange={(e) => setLinha(i, { codigo: e.target.value })}
                  className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
                >
                  <option value="">— selecione o insumo —</option>
                  {insumos.map((ins) => (
                    <option key={ins.codigo} value={ins.codigo}>
                      {ins.codigo} — {ins.nome}
                      {ins.ativo ? "" : " (inativo)"}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={l.qtd}
                  onChange={(e) =>
                    setLinha(i, { qtd: parseFloat(e.target.value) || 0 })
                  }
                  className="h-8 w-20 rounded-md border bg-background px-2 text-right text-xs tabular-nums outline-none focus:border-ring"
                />
                <span className="w-6 text-[10px] text-muted-foreground">
                  {insumos.find((x) => x.codigo === l.codigo)?.unidade ?? ""}
                </span>
                <button
                  type="button"
                  onClick={() => delLinha(i)}
                  aria-label="Remover insumo"
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addLinha}
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
          >
            <Plus className="size-3.5" /> adicionar insumo
          </button>

          <div className="mt-3 flex items-center gap-2 border-t pt-2">
            <button
              type="button"
              onClick={salvar}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              Salvar ficha
            </button>
            {temFicha && (
              <button
                type="button"
                onClick={remover}
                disabled={pending}
                aria-label="Remover ficha"
                className="inline-flex size-8 items-center justify-center rounded-md border text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:hover:bg-rose-950/30"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
            {msg && (
              <span className="text-[11px] text-muted-foreground">{msg}</span>
            )}
          </div>
        </div>
      )}
    </details>
  )
}
