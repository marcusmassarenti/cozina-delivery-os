"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { ImageUp, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { removeLogo, uploadLogo, type BrandingState } from "../_actions"

const initial: BrandingState = { ok: false }

export function LogoUploader({ currentLogo }: { currentLogo: string | null }) {
  const [state, formAction] = useActionState(uploadLogo, initial)
  const [preview, setPreview] = React.useState<string | null>(null)
  const [isRemoving, startRemove] = React.useTransition()
  const router = useRouter()

  React.useEffect(() => {
    if (state.ok) {
      setPreview(null)
      router.refresh()
    }
  }, [state, router])

  // Sempre mostra o logo EFETIVO: nova prévia > logo customizado > padrão.
  const shown = preview || currentLogo || "/cozina-logo.png"
  const caption = preview
    ? "Prévia da nova imagem"
    : currentLogo
      ? "Logo atual da sua empresa"
      : "Logo padrão do sistema — suba o seu pra substituir"

  return (
    <div className="max-w-xl rounded-xl border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-semibold">Logo da empresa</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Aparece no topo do menu lateral. PNG, JPG, WEBP ou SVG — até 2 MB.
        Dica: imagem com fundo transparente fica melhor.
      </p>

      {/* Preview (fundo escuro pra simular o menu) */}
      <div className="mt-4 flex h-24 items-center justify-center rounded-lg border bg-zinc-900 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={shown}
          alt="Prévia do logo"
          className="max-h-14 w-auto max-w-[220px] object-contain"
        />
      </div>
      <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
        {caption}
      </p>

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
            Logo atualizado! Recarregue a página se o menu ainda mostrar o antigo.
          </div>
        )}

        <div className="flex items-center gap-2">
          <SubmitButton />
          {currentLogo && (
            <Button
              type="button"
              variant="outline"
              disabled={isRemoving}
              onClick={() =>
                startRemove(async () => {
                  const r = await removeLogo()
                  if (r.ok) router.refresh()
                })
              }
            >
              <Trash2 className="size-4" />
              {isRemoving ? "Removendo..." : "Remover logo"}
            </Button>
          )}
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
      {pending ? "Enviando..." : "Salvar logo"}
    </Button>
  )
}
