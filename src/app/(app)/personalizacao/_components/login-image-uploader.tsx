"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { ImageUp, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  removeLoginImage,
  uploadLoginImage,
  type BrandingState,
} from "../_actions"

const initial: BrandingState = { ok: false }

export function LoginImageUploader({
  currentImage,
}: {
  currentImage: string | null
}) {
  const [state, formAction] = useActionState(uploadLoginImage, initial)
  const [preview, setPreview] = React.useState<string | null>(null)
  const [isRemoving, startRemove] = React.useTransition()
  const router = useRouter()

  React.useEffect(() => {
    if (state.ok) {
      setPreview(null)
      router.refresh()
    }
  }, [state, router])

  const shown = preview || currentImage

  return (
    <div className="max-w-xl rounded-xl border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-semibold">Imagem da tela de login</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Aparece como fundo da tela de login (a porta da plataforma). Use uma
        imagem horizontal e bonita — PNG, JPG ou WEBP, até 5 MB. Sem imagem, o
        login mostra um fundo genérico.
      </p>

      {/* Preview no formato do hero do login */}
      <div className="relative mt-4 aspect-[16/10] w-full overflow-hidden rounded-lg border bg-zinc-950">
        {shown ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shown}
              alt="Prévia da tela de login"
              className="absolute inset-0 size-full object-cover opacity-70"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
            <div className="absolute bottom-3 left-3 text-sm font-semibold text-white">
              Toda a sua operação num só painel.
            </div>
          </>
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-zinc-400">
            Sem imagem — login usa o fundo genérico
          </div>
        )}
      </div>

      <form action={formAction} className="mt-4 flex flex-col gap-3">
        <input
          type="file"
          name="loginImage"
          accept="image/png,image/jpeg,image/webp"
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
            Imagem da tela de login atualizada!
          </div>
        )}

        <div className="flex items-center gap-2">
          <SubmitButton />
          {currentImage && (
            <Button
              type="button"
              variant="outline"
              disabled={isRemoving}
              onClick={() =>
                startRemove(async () => {
                  const r = await removeLoginImage()
                  if (r.ok) router.refresh()
                })
              }
            >
              <Trash2 className="size-4" />
              {isRemoving ? "Removendo..." : "Remover imagem"}
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
      {pending ? "Enviando..." : "Salvar imagem de login"}
    </Button>
  )
}
