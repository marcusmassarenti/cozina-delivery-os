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
}: {
  unitId: string
  unitName: string
  currentLogo: string | null
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
