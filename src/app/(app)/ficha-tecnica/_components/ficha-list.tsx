"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, Loader2, Plus, Save, Trash2, X } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { deletePrato, setFicha } from "../_actions"
import type { Insumo, Prato } from "@/lib/data/producao"

type Linha = { codigo: string; qtd: number }

/**
 * Pratos canônicos + editor da ficha técnica. Cada insumo é escolhido num
 * seletor (do catálogo) com a quantidade ao lado — sem digitar código.
 */
export function FichaList({
  pratos,
  insumos,
}: {
  pratos: Prato[]
  insumos: Insumo[]
}) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-sm font-semibold">Pratos &amp; ficha técnica</h3>
        <span className="text-[11px] text-muted-foreground">
          {pratos.length} prato(s)
        </span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Pra cada prato, escolha os insumos e a quantidade por prato vendido. É o
        que vira a demanda de produção.
      </p>

      {insumos.length === 0 ? (
        <p className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Cadastre os insumos no catálogo acima primeiro — eles aparecem no
          seletor da ficha.
        </p>
      ) : pratos.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Nenhum prato ainda — mapeie um item vendido acima pra criar o primeiro.
        </p>
      ) : (
        <div className="space-y-2">
          {pratos.map((p) => (
            <PratoCard key={p.id} prato={p} insumos={insumos} />
          ))}
        </div>
      )}
    </div>
  )
}

function PratoCard({ prato, insumos }: { prato: Prato; insumos: Insumo[] }) {
  const router = useRouter()
  const [linhas, setLinhas] = React.useState<Linha[]>(
    prato.ficha.map((f) => ({ codigo: f.insumoCodigo, qtd: f.qtd })),
  )
  const [pending, start] = React.useTransition()
  const [msg, setMsg] = React.useState<string | null>(null)

  const setLinha = (i: number, patch: Partial<Linha>) =>
    setLinhas((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const addLinha = () =>
    setLinhas((arr) => [...arr, { codigo: "", qtd: 1 }])
  const delLinha = (i: number) =>
    setLinhas((arr) => arr.filter((_, idx) => idx !== i))

  const salvar = () => {
    start(async () => {
      const res = await setFicha({
        pratoId: prato.id,
        linhas: linhas.filter((l) => l.codigo && l.qtd > 0),
      })
      setMsg(res.message ?? (res.ok ? "Salvo." : "Erro."))
      if (res.ok) router.refresh()
    })
  }
  const remover = () => {
    if (!confirm(`Apagar o prato "${prato.nome}" e sua ficha?`)) return
    start(async () => {
      const res = await deletePrato(prato.id)
      if (res.ok) router.refresh()
      else setMsg(res.message ?? "Erro")
    })
  }

  return (
    <details className="group rounded-lg border">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        <span className="text-sm font-medium">{prato.nome}</span>
        <span className="flex items-center gap-1">
          {prato.nomes.map((n) => (
            <PlatformLogo key={n.id} platform={n.platform} size="sm" />
          ))}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {prato.ficha.length} insumo(s)
        </span>
      </summary>
      <div className="border-t px-3 py-3">
        {prato.nomes.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {prato.nomes.map((n) => (
              <span
                key={n.id}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {n.platform}: {n.nomeItem}
              </span>
            ))}
          </div>
        )}

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
                aria-label="Remover"
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
          <button
            type="button"
            onClick={remover}
            disabled={pending}
            aria-label="Apagar prato"
            className="inline-flex size-8 items-center justify-center rounded-md border text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:hover:bg-rose-950/30"
          >
            <Trash2 className="size-3.5" />
          </button>
          {msg && (
            <span className="text-[11px] text-muted-foreground">{msg}</span>
          )}
        </div>
      </div>
    </details>
  )
}
