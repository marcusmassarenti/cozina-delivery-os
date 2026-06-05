"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, Loader2, Save, Trash2 } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { deletePrato, setFicha } from "../_actions"
import type { Insumo, Prato } from "@/lib/data/producao"

/**
 * Pratos canônicos + editor da ficha técnica. A ficha é editada como texto
 * ("CÓDIGO x QTD" por linha) — simples e rápido de preencher/colar.
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
        Pra cada prato, liste os insumos: uma linha <b>CÓDIGO x QTD</b> (ex.:{" "}
        <code className="rounded bg-muted px-1">CNP053 x 1</code>). É o que vira
        a demanda de produção.
      </p>

      {pratos.length === 0 ? (
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
  const insumoNome = React.useMemo(
    () => new Map(insumos.map((i) => [i.codigo, i.nome])),
    [insumos],
  )
  const initial = prato.ficha
    .map((f) => `${f.insumoCodigo} x ${f.qtd}`)
    .join("\n")
  const [text, setText] = React.useState(initial)
  const [pending, start] = React.useTransition()
  const [msg, setMsg] = React.useState<string | null>(null)

  const salvar = () => {
    start(async () => {
      const res = await setFicha({ pratoId: prato.id, text })
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
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"CNP053 x 1\nCNP061 x 2"}
          rows={Math.max(3, prato.ficha.length + 1)}
          className="w-full rounded-md border bg-background p-2 font-mono text-xs outline-none focus:border-ring"
        />
        {/* Pré-visualização dos nomes dos códigos digitados */}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
          {text
            .replace(/×/g, "x")
            .split("\n")
            .map((l) => l.trim().match(/^(\S+)/)?.[1]?.toUpperCase())
            .filter((c): c is string => !!c)
            .map((c, idx) => (
              <span key={`${c}-${idx}`}>
                <b>{c}</b>{" "}
                {insumoNome.has(c) ? (
                  insumoNome.get(c)
                ) : (
                  <span className="text-rose-600">(fora do catálogo)</span>
                )}
              </span>
            ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
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
