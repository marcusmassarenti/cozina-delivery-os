"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { ImageUp, Store, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  applyStoreLogoToAll,
  clearStoreLogoFromAll,
  type BrandingState,
} from "../_actions"

const initial: BrandingState = { ok: false }

/**
 * Logo das LOJAS (avatar). Aplica um único logo em todas as lojas da empresa de
 * uma vez — ideal pra rede de marca única (ex.: Churrasco no Pote). Cada loja
 * ainda pode ter um logo próprio no "Editar unidade" (sobrepõe este).
 */
export function StoreLogoUploader() {
  const [state, formAction] = useActionState(applyStoreLogoToAll, initial)
  const [preview, setPreview] = React.useState<string | null>(null)
  const [isClearing, startClear] = React.useTransition()
  const router = useRouter()

  React.useEffect(() => {
    if (state.ok) {
      setPreview(null)
      router.refresh()
    }
  }, [state, router])

  return (
    <div className="max-w-xl rounded-xl border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-semibold">Logo das lojas</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Aparece como avatar de <strong>todas as suas lojas</strong> de uma vez —
        ideal pra rede de marca única. Use uma imagem quadrada (ex.: o logo
        redondo do Churrasco no Pote).
      </p>

      <div className="mt-4 flex items-center gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
          {preview ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={preview} alt="" className="size-full object-cover" />
          ) : (
            <Store className="size-7 text-muted-foreground" />
          )}
        </span>
        <p className="text-[11px] text-muted-foreground">
          {preview
            ? "Prévia — clique em Aplicar pra usar em todas as lojas."
            : "Escolha um arquivo abaixo."}
        </p>
      </div>

      <form action={formAction} className="mt-4 flex flex-col gap-3">
        <input
          type="file"
          name="logo"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          required
          onChange={(e) => {
            const f = e.target.files?.[0]
            setPreview(f ? URL.createObjectURL(f) : null)
          }}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:opacity-90"
        />

        {state.message && !state.ok && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
            {state.message}
          </div>
        )}
        {state.ok && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400">
            {state.message ?? "Aplicado!"} Recarregue se ainda mostrar o antigo.
          </div>
        )}

        {/* flex-wrap: os dois botões lado a lado vazavam da tela no mobile. */}
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton />
          <Button
            type="button"
            variant="outline"
            disabled={isClearing}
            onClick={() =>
              startClear(async () => {
                const r = await clearStoreLogoFromAll()
                if (r.ok) router.refresh()
              })
            }
          >
            <Trash2 className="size-4" />
            {isClearing ? "Removendo..." : "Remover de todas"}
          </Button>
        </div>
      </form>
    </div>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      <ImageUp className="size-4" />
      {pending ? "Aplicando..." : "Aplicar em todas as lojas"}
    </Button>
  )
}
