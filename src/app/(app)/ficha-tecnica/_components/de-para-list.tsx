"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2, X } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { fmtNum } from "@/lib/format"
import { mapItem, unmapItem } from "../_actions"
import type { ItemVendido } from "@/lib/data/producao"

/**
 * Lista os itens vendidos no mês e deixa mapear cada um pra um prato canônico.
 * Não mapeados de maior volume aparecem primeiro (a lista já vem ordenada).
 */
export function DeParaList({
  itens,
  pratoNames,
}: {
  itens: ItemVendido[]
  pratoNames: string[]
}) {
  const [soPendentes, setSoPendentes] = React.useState(true)
  const naoMapeados = itens.filter((i) => !i.pratoId).length
  const lista = soPendentes ? itens.filter((i) => !i.pratoId) : itens

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Itens vendidos → prato</h3>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {naoMapeados} sem mapear
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={soPendentes}
            onChange={(e) => setSoPendentes(e.target.checked)}
          />
          só não mapeados
        </label>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Digite o nome do prato (ex.: &quot;Churrasco no Pote G&quot;). Se ainda
        não existe, ele é criado. O mesmo prato pode receber vários nomes (um por
        plataforma).
      </p>

      {lista.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          {soPendentes ? "Tudo mapeado neste mês 🎉" : "Sem itens no mês."}
        </p>
      ) : (
        <datalist id="pratos-dl">
          {pratoNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      )}

      <div className="divide-y">
        {lista.map((it) => (
          <Linha key={`${it.platform}|${it.nomeItem}`} item={it} />
        ))}
      </div>
    </div>
  )
}

function Linha({ item }: { item: ItemVendido }) {
  const router = useRouter()
  const [valor, setValor] = React.useState(item.pratoNome ?? "")
  const [pending, start] = React.useTransition()
  const [erro, setErro] = React.useState<string | null>(null)

  const salvar = () => {
    if (!valor.trim()) return
    start(async () => {
      const res = await mapItem({
        platform: item.platform,
        nomeItem: item.nomeItem,
        pratoNome: valor,
      })
      if (res.ok) router.refresh()
      else setErro(res.message ?? "Erro")
    })
  }
  const desmapear = () => {
    start(async () => {
      const res = await unmapItem({
        platform: item.platform,
        nomeItem: item.nomeItem,
      })
      if (res.ok) {
        setValor("")
        router.refresh()
      } else setErro(res.message ?? "Erro")
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <PlatformLogo platform={item.platform} size="sm" />
      <span className="min-w-0 flex-1 truncate text-xs" title={item.nomeItem}>
        {item.nomeItem}
      </span>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {fmtNum(item.qtd)} un
      </span>
      <input
        list="pratos-dl"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") salvar()
        }}
        placeholder="prato canônico…"
        className="h-8 w-48 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
      />
      {item.pratoId ? (
        <button
          type="button"
          onClick={desmapear}
          disabled={pending}
          aria-label="Desmapear"
          className="inline-flex size-8 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <X className="size-3.5" />
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={salvar}
          disabled={pending || !valor.trim()}
          className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          Mapear
        </button>
      )}
      {erro && <span className="w-full text-[11px] text-rose-600">{erro}</span>}
    </div>
  )
}
