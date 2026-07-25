"use client"

import * as React from "react"
import { Plug } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type UnidadeOpcao = { id: string; code: string; name: string }

/**
 * Porta de entrada do fluxo OAuth: manda pro /api/cardapioweb/oauth/start,
 * que gera o PKCE e redireciona pro portal do Cardápio Web.
 *
 * Navegação por `window.location` de propósito — é um redirect de página
 * inteira pra um domínio externo, não uma rota interna do app.
 */
export function ConectarLoja({ unidades }: { unidades: UnidadeOpcao[] }) {
  const [ambiente, setAmbiente] = React.useState<"sandbox" | "producao">(
    "sandbox",
  )
  const [unitId, setUnitId] = React.useState<string>("")
  const [indo, setIndo] = React.useState(false)

  function conectar() {
    setIndo(true)
    const url = new URL("/api/cardapioweb/oauth/start", window.location.origin)
    url.searchParams.set("ambiente", ambiente)
    if (unitId) url.searchParams.set("unit_id", unitId)
    window.location.href = url.toString()
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Plug className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Conectar uma loja</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Você será levado ao portal do Cardápio Web para autorizar. Só o
            perfil <b>Proprietário</b> da loja consegue autorizar lá.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Ambiente
          </label>
          <Select
            value={ambiente}
            onValueChange={(v) =>
              setAmbiente((v as "sandbox" | "producao") ?? "sandbox")
            }
          >
            <SelectTrigger className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sandbox">Sandbox (teste)</SelectItem>
              <SelectItem value="producao">Produção</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Vincular à unidade (opcional)
          </label>
          <Select value={unitId} onValueChange={(v) => setUnitId(v ?? "")}>
            <SelectTrigger className="h-9 w-64">
              <SelectValue placeholder="Escolher depois" />
            </SelectTrigger>
            <SelectContent>
              {unidades.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  #{u.code} · {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={conectar} disabled={indo} className="h-9">
          <Plug className="size-4" />
          {indo ? "Redirecionando..." : "Conectar no Cardápio Web"}
        </Button>
      </div>

      {ambiente === "producao" && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
          O app ainda está cadastrado apenas no <b>sandbox</b>. Produção exige
          liberação separada junto ao Cardápio Web.
        </p>
      )}
    </div>
  )
}
