"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ImageUp, Loader2, Trash2 } from "lucide-react"

import { BrandLogo } from "@/components/brand-logo"
import { removeUnitLogo, saveUnitLogo } from "../_actions"

/**
 * Logo POR LOJA (white-label por unidade). Sobe na hora (não usa o submit do
 * form de edição). Sem logo, o avatar cai no logo da empresa / inicial.
 */
export function UnitLogoUploader({
  unitId,
  unitName,
  currentLogo,
  compact,
}: {
  unitId: string
  unitName: string
  currentLogo: string | null
  /** Só o avatar clicável (badge de trocar + lixeira mini) — usado no
   *  cabeçalho do Editar pra não gastar uma linha inteira do dialog. */
  compact?: boolean
}) {
  const router = useRouter()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [busy, start] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.set("unitId", unitId)
    fd.set("logo", file)
    setError(null)
    start(async () => {
      const r = await saveUnitLogo(fd)
      if (r.ok) router.refresh()
      else setError(r.message ?? "Falha no upload")
      if (inputRef.current) inputRef.current.value = ""
    })
  }

  function onRemove() {
    setError(null)
    start(async () => {
      const r = await removeUnitLogo(unitId)
      if (r.ok) router.refresh()
      else setError(r.message ?? "Falha ao remover")
    })
  }

  if (compact) {
    return (
      <div className="flex shrink-0 items-center gap-1" title="Logo da loja — PNG, JPG, WEBP ou SVG, até 2 MB">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={onPick}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="group relative rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={currentLogo ? "Trocar logo da loja" : "Enviar logo da loja"}
        >
          <BrandLogo size="md" logoUrl={currentLogo} name={unitName} />
          <span className="absolute -right-1 -bottom-1 rounded-full border bg-background p-0.5 shadow-sm transition-colors group-hover:bg-accent">
            {busy ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <ImageUp className="size-3" />
            )}
          </span>
        </button>
        {/* Sem logo, o avatar cai na inicial da loja e ninguém adivinha que
            aquilo é clicável — o rótulo diz o que fazer. */}
        {!currentLogo && (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="text-[10px] font-medium leading-tight text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            Adicionar
            <br />
            logo
          </button>
        )}
        {currentLogo && (
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            title="Remover logo"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <Trash2 className="size-3" />
          </button>
        )}
        {error && (
          <span className="max-w-40 text-[10px] leading-tight text-rose-600">
            {error}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
      <BrandLogo size="lg" logoUrl={currentLogo} name={unitName} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Logo da loja</p>
        <p className="text-[11px] text-muted-foreground">
          PNG, JPG, WEBP ou SVG, até 2 MB. Sem logo, usa o da empresa.
        </p>
        {error && <p className="mt-1 text-[11px] text-rose-600">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={onPick}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ImageUp className="size-3.5" />
          )}
          {currentLogo ? "Trocar" : "Enviar"}
        </button>
        {currentLogo && (
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            title="Remover logo"
            className="rounded-md border bg-background p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-50"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
