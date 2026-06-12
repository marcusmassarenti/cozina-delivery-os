"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { saveCompanyName, type BrandingState } from "../_actions"

const initial: BrandingState = { ok: false }

/**
 * Nome da empresa (holdings.name). Aparece no menu, nos relatórios e nas
 * boas-vindas — é a marca do negócio, diferente do nome do usuário logado.
 */
export function CompanyNameForm({ current }: { current: string }) {
  const [state, formAction] = useActionState(saveCompanyName, initial)
  const router = useRouter()

  React.useEffect(() => {
    if (state.ok) router.refresh()
  }, [state, router])

  return (
    <div className="max-w-xl rounded-xl border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-semibold">Nome da empresa</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Aparece no menu lateral, nos relatórios e nas boas-vindas. É a marca do
        negócio — diferente do nome de quem está logado.
      </p>

      <form action={formAction} className="mt-4 flex items-center gap-2">
        <Input
          name="name"
          defaultValue={current}
          placeholder="Ex.: Minha Empresa"
          maxLength={60}
          required
          className="flex-1"
        />
        <SubmitButton />
      </form>

      {state.message && !state.ok && (
        <p className="mt-2 text-xs text-rose-600">{state.message}</p>
      )}
      {state.ok && (
        <p className="mt-2 flex items-center gap-1 text-xs text-emerald-600">
          <Check className="size-3.5" /> Nome salvo!
        </p>
      )}
    </div>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando..." : "Salvar"}
    </Button>
  )
}
