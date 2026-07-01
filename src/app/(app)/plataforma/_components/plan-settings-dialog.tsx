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
 * Edita o preço do plano PADRÃO do self-service (o que vale pra quem se cadastra
 * sozinho e ainda não tem preço custom). Só super-admin.
 */
export function PlanSettingsDialog({
  monthlyFee,
  pricePerUnit,
  includedUnits,
}: {
  monthlyFee: number
  pricePerUnit: number
  includedUnits: number
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
            Preço do plano padrão
          </DialogTitle>
          <DialogDescription>
            Vale pra quem se cadastra sozinho (self-service). Clientes com preço
            custom definido na cobrança não são afetados.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="monthlyFee" className="text-xs font-medium">
                Mensalidade base (R$)
              </label>
              <input
                id="monthlyFee"
                name="monthlyFee"
                inputMode="decimal"
                defaultValue={String(monthlyFee).replace(".", ",")}
                required
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="pricePerUnit" className="text-xs font-medium">
                Por loja extra (R$)
              </label>
              <input
                id="pricePerUnit"
                name="pricePerUnit"
                inputMode="decimal"
                defaultValue={String(pricePerUnit).replace(".", ",")}
                required
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label htmlFor="includedUnits" className="text-xs font-medium">
              Lojas inclusas na base
            </label>
            <input
              id="includedUnits"
              name="includedUnits"
              type="number"
              min={1}
              step={1}
              defaultValue={includedUnits}
              className={inputCls}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Quantas lojas já vêm na mensalidade base antes de cobrar por loja
              extra.
            </p>
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
