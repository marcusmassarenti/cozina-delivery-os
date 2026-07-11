"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { Tag } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { setPlatformPlan, type BillingActionState } from "../_actions"

function SubmitBtn() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando..." : "Salvar preço"}
    </Button>
  )
}

/**
 * Edita o preço POR LOJA dos planos Essencial e Pro do self-service (o que vale
 * pra quem se cadastra sozinho e ainda não tem preço custom). Só super-admin.
 */
export function PlanSettingsDialog({
  essencial,
  pro,
  ai,
}: {
  essencial: number
  pro: number
  ai: number
}) {
  const [open, setOpen] = React.useState(false)
  const router = useRouter()
  const [state, action] = useActionState<BillingActionState, FormData>(
    setPlatformPlan,
    { ok: false },
  )

  React.useEffect(() => {
    if (state.ok) {
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  const inputCls =
    "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Tag className="size-4" />
            Plano padrão
          </button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="size-5 text-muted-foreground" />
            Preço dos planos (por loja)
          </DialogTitle>
          <DialogDescription>
            Valor por loja/mês de cada plano do self-service. A mensalidade do
            cliente = preço × nº de lojas ativas. Clientes com preço combinado
            não são afetados.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="essencial" className="text-xs font-medium">
                Essencial (R$/loja)
              </label>
              <input
                id="essencial"
                name="essencial"
                inputMode="decimal"
                defaultValue={String(essencial).replace(".", ",")}
                required
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="pro" className="text-xs font-medium">
                Pro (R$/loja)
              </label>
              <input
                id="pro"
                name="pro"
                inputMode="decimal"
                defaultValue={String(pro).replace(".", ",")}
                required
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="ai" className="text-xs font-medium">
                DeliveryOS AI (R$/loja)
              </label>
              <input
                id="ai"
                name="ai"
                inputMode="decimal"
                defaultValue={String(ai).replace(".", ",")}
                required
                className={inputCls}
              />
            </div>
          </div>

          {state.message && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
              {state.message}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <SubmitBtn />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
