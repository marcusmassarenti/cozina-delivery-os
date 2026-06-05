"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, Copy, Loader2 } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { fmtNum } from "@/lib/format"
import { bulkSetFichas } from "../_actions"
import type { Insumo, ItemVendido } from "@/lib/data/producao"

const keyOf = (i: { platform: string; nomeItem: string }) =>
  `${i.platform}|${i.nomeItem}`

/**
 * Ação em massa: copia a ficha de um produto-origem pra vários destinos de uma
 * vez. Suporta "só muda a proteína" — você marca o insumo que varia e escolhe a
 * proteína de cada destino.
 */
export function BulkFichaAction({
  itens,
  insumos,
}: {
  itens: ItemVendido[]
  insumos: Insumo[]
}) {
  const router = useRouter()
  const itemByKey = React.useMemo(
    () => new Map(itens.map((i) => [keyOf(i), i])),
    [itens],
  )
  const fontes = itens.filter((i) => i.ficha.length > 0)

  const [sourceKey, setSourceKey] = React.useState("")
  const [variavel, setVariavel] = React.useState("")
  const [checked, setChecked] = React.useState<Record<string, boolean>>({})
  const [protein, setProtein] = React.useState<Record<string, string>>({})
  const [busca, setBusca] = React.useState("")
  const [mostrarTodos, setMostrarTodos] = React.useState(false)
  const [msg, setMsg] = React.useState<string | null>(null)
  const [pending, start] = React.useTransition()

  const source = sourceKey ? itemByKey.get(sourceKey) : undefined
  const sourceFicha = source?.ficha ?? []

  const candidatos = itens
    .filter((i) => keyOf(i) !== sourceKey)
    .filter((i) => (mostrarTodos ? true : i.ficha.length === 0))
    .filter((i) =>
      busca ? i.nomeItem.toLowerCase().includes(busca.toLowerCase()) : true,
    )
  const marcados = Object.keys(checked).filter((k) => checked[k])

  const aplicar = () => {
    if (!source || marcados.length === 0) return
    const targets = marcados.map((k) => {
      const it = itemByKey.get(k)!
      const prot = protein[k] || variavel
      const linhas = sourceFicha
        .map((f) => ({
          codigo:
            variavel && f.insumoCodigo === variavel ? prot : f.insumoCodigo,
          qtd: f.qtd,
        }))
        .filter((l) => l.codigo)
      return { platform: it.platform, nomeItem: it.nomeItem, linhas }
    })
    start(async () => {
      const res = await bulkSetFichas(targets)
      setMsg(res.message ?? (res.ok ? "Aplicado." : "Erro."))
      if (res.ok) {
        setChecked({})
        router.refresh()
      }
    })
  }

  return (
    <details className="group rounded-xl border bg-card shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-5 [&::-webkit-details-marker]:hidden">
        <Copy className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">
          Ação em massa: copiar ficha
        </h3>
        <span className="text-[11px] text-muted-foreground">
          mesma base, só muda a proteína
        </span>
        <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>

      <div className="space-y-3 border-t px-5 py-4">
        {/* Origem */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium">Copiar a ficha de:</span>
          <select
            value={sourceKey}
            onChange={(e) => {
              setSourceKey(e.target.value)
              setVariavel("")
            }}
            className="h-8 min-w-48 max-w-full rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
          >
            <option value="">— escolha um produto com ficha —</option>
            {fontes.map((f) => (
              <option key={keyOf(f)} value={keyOf(f)}>
                {f.nomeItem} ({f.platform}) · {f.ficha.length} insumo(s)
              </option>
            ))}
          </select>
        </div>

        {source && (
          <>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-muted-foreground">Ficha:</span>
              {sourceFicha.map((f) => (
                <span
                  key={f.insumoCodigo}
                  className={`rounded px-1.5 py-0.5 text-[10px] ${
                    variavel === f.insumoCodigo
                      ? "bg-amber-100 font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {f.insumoCodigo} ×{f.qtd}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium">
                Insumo que muda por produto:
              </span>
              <select
                value={variavel}
                onChange={(e) => setVariavel(e.target.value)}
                className="h-8 min-w-40 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
              >
                <option value="">nenhum (cópia exata)</option>
                {sourceFicha.map((f) => (
                  <option key={f.insumoCodigo} value={f.insumoCodigo}>
                    {f.insumoCodigo} — {f.insumoNome}
                  </option>
                ))}
              </select>
              {variavel && (
                <span className="text-[11px] text-muted-foreground">
                  ↳ escolha a proteína de cada destino abaixo
                </span>
              )}
            </div>

            {/* Destinos */}
            <div className="rounded-lg border">
              <div className="flex items-center gap-2 border-b p-2">
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="buscar item…"
                  className="h-7 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
                />
                <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={mostrarTodos}
                    onChange={(e) => setMostrarTodos(e.target.checked)}
                  />
                  incluir já preenchidos
                </label>
              </div>
              <div className="max-h-56 overflow-auto p-1">
                {candidatos.length === 0 ? (
                  <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                    Nenhum item.
                  </p>
                ) : (
                  candidatos.map((it) => {
                    const k = keyOf(it)
                    const on = !!checked[k]
                    return (
                      <div
                        key={k}
                        className="flex flex-wrap items-center gap-2 rounded px-2 py-1 hover:bg-muted/40"
                      >
                        <label className="flex min-w-0 flex-1 items-center gap-2">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) =>
                              setChecked((c) => ({
                                ...c,
                                [k]: e.target.checked,
                              }))
                            }
                          />
                          <PlatformLogo platform={it.platform} size="sm" />
                          <span
                            className="min-w-0 flex-1 truncate text-xs"
                            title={it.nomeItem}
                          >
                            {it.nomeItem}
                          </span>
                          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                            {fmtNum(it.qtd)} un
                          </span>
                          {it.ficha.length > 0 && (
                            <span className="shrink-0 text-[9px] text-emerald-600">
                              tem ficha
                            </span>
                          )}
                        </label>
                        {on && variavel && (
                          <select
                            value={protein[k] || variavel}
                            onChange={(e) =>
                              setProtein((p) => ({ ...p, [k]: e.target.value }))
                            }
                            className="h-7 w-44 rounded-md border bg-background px-1.5 text-[11px] outline-none focus:border-ring"
                          >
                            {insumos.map((ins) => (
                              <option key={ins.codigo} value={ins.codigo}>
                                {ins.codigo} — {ins.nome}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={aplicar}
                disabled={pending || marcados.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {pending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                Aplicar ficha a {marcados.length} produto(s)
              </button>
              {variavel
                ? null
                : marcados.length > 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      cópia exata
                    </span>
                  )}
              {msg && (
                <span className="text-[11px] text-muted-foreground">{msg}</span>
              )}
            </div>
            <p className="text-[10px] leading-snug text-muted-foreground">
              Sobrescreve a ficha dos destinos selecionados.{" "}
              {variavel
                ? "A proteína de cada um é a que você escolheu; o resto vem igual da origem."
                : "Cópia exata da origem."}
            </p>
          </>
        )}
      </div>
    </details>
  )
}
