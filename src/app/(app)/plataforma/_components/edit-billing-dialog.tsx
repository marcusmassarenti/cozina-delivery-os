"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { Pencil } from "lucide-react"

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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { setClientBilling, type BillingActionState } from "../_actions"

export type BillingClient = {
  id: string
  name: string
  establishmentType: string | null
  paymentMethod: string | null
  monthlyFee: number | null
  dueDate: string | null
  paid: boolean
  suspendOn: string | null
}

const METHODS = ["Pix", "Boleto", "Cartão", "Transferência", "Dinheiro", "Outro"]
const ESTAB = ["Restaurante", "Delivery próprio", "Franquia", "Outro"]
const initial: BillingActionState = { ok: false }

export function EditBillingDialog({ client }: { client: BillingClient }) {
  const [open, setOpen] = React.useState(false)
  const [state, formAction] = useActionState(setClientBilling, initial)
  const [paid, setPaid] = React.useState(client.paid)
  const router = useRouter()

  React.useEffect(() => {
    if (state.ok) {
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Pencil className="size-3.5" />
            Editar
          </button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-5 text-primary" />
            Editar cliente
          </DialogTitle>
          <DialogDescription>
            Cadastro e cobrança. Se não estiver pago e passar da data de
            suspensão, o acesso do cliente é bloqueado.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="holdingId" value={client.id} />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome da empresa">
              <Input name="name" defaultValue={client.name} required />
            </Field>
            <Field label="Tipo de estabelecimento">
              <select
                name="establishmentType"
                defaultValue={client.establishmentType ?? ""}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                <option value="">—</option>
                {ESTAB.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Forma de pagamento">
              <select
                name="paymentMethod"
                defaultValue={client.paymentMethod ?? ""}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                <option value="">—</option>
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Valor mensal (R$)">
              <Input
                name="monthlyFee"
                inputMode="decimal"
                placeholder="ex.: 199,90"
                defaultValue={
                  client.monthlyFee != null
                    ? String(client.monthlyFee).replace(".", ",")
                    : ""
                }
              />
            </Field>
          </div>

          <Field label="Vencimento">
            <Input type="date" name="dueDate" defaultValue={client.dueDate ?? ""} />
          </Field>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="paid"
              checked={paid}
              onChange={(e) => setPaid(e.target.checked)}
              className="size-4 rounded border-border"
            />
            <span>Pagamento em dia (pago)</span>
          </label>

          {!paid && (
            <Field label="Suspender acesso a partir de">
              <Input
                type="date"
                name="suspendOn"
                defaultValue={client.suspendOn ?? ""}
              />
              <p className="text-[10px] text-muted-foreground">
                Se não pagar até essa data, o cliente fica sem acesso ao sistema.
              </p>
            </Field>
          )}

          {state.message && !state.ok && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
              {state.message}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
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
