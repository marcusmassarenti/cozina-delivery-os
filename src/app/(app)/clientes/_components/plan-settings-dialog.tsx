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
import type { PrecosPlano } from "@/lib/data/assinatura"

function SubmitBtn() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando..." : "Salvar preço"}
    </Button>
  )
}

/**
 * Edita o preço dos planos do self-service — modelo "primeira loja + adicional"
 * por plano. A mensalidade = primeira + adicional × (nº de lojas − 1). Clientes
 * com preço combinado não são afetados. Só super-admin.
 */
export function PlanSettingsDialog({
  precos,
  pacotePreco,
}: {
  precos: PrecosPlano
  /** Preço do pacote de perguntas extras do Consultor IA (Fase 2). */
  pacotePreco: number
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
            Preços dos planos
          </button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="size-5 text-muted-foreground" />
            Preço dos planos
          </DialogTitle>
          <DialogDescription>
            Modelo &ldquo;primeira loja + adicionais&rdquo;. A mensalidade ={" "}
            primeira loja + adicional × (nº de lojas − 1). Clientes com preço
            combinado não são afetados.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-4">
          {/* Cabeçalho da grade */}
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Plano
            </span>
            <span className="w-24 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              1ª loja
            </span>
            <span className="w-24 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Adicional
            </span>
          </div>
          {(
            [
              { id: "essencial", label: "Essencial" },
              { id: "pro", label: "Pro" },
              { id: "ai", label: "DeliveryOS AI" },
            ] as const
          ).map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3"
            >
              <span className="text-sm font-medium">{p.label}</span>
              <input
                name={`${p.id}_first`}
                inputMode="decimal"
                aria-label={`${p.label} — primeira loja`}
                defaultValue={String(precos[p.id].first).replace(".", ",")}
                required
                className={`${inputCls} mt-0 w-24 text-center`}
              />
              <input
                name={`${p.id}_add`}
                inputMode="decimal"
                aria-label={`${p.label} — loja adicional`}
                defaultValue={String(precos[p.id].add).replace(".", ",")}
                required
                className={`${inputCls} mt-0 w-24 text-center`}
              />
            </div>
          ))}

          <div className="border-t pt-3">
            <label htmlFor="pacotePreco" className="text-xs font-medium">
              Pacote de perguntas do Nino AI (R$)
            </label>
            <input
              id="pacotePreco"
              name="pacotePreco"
              inputMode="decimal"
              defaultValue={String(pacotePreco).replace(".", ",")}
              className={inputCls}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Preço de cada pacote de perguntas extras que o cliente compra
              quando a cota do mês acaba.
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
