"use client"

import * as React from "react"
import { useActionState, useTransition } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { Loader2, Plus, Receipt, Trash2 } from "lucide-react"

import { fmtBRL } from "@/lib/format"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { deletePayment, recordPayment, type BillingActionState } from "../_actions"
import type { HoldingPayment } from "@/lib/data/plataforma"

const METHODS = ["Pix", "Boleto", "Cartão", "Transferência", "Dinheiro", "Outro"]
const initial: BillingActionState = { ok: false }

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-")
  return `${day}/${m}/${y}`
}

export function PaymentsDialog({
  client,
}: {
  client: {
    id: string
    name: string
    payments: HoldingPayment[]
    suggested: number
    method: string | null
  }
}) {
  const [open, setOpen] = React.useState(false)
  const [showForm, setShowForm] = React.useState(false)
  const [state, formAction] = useActionState(recordPayment, initial)
  const [delPending, startDel] = useTransition()
  const router = useRouter()

  React.useEffect(() => {
    if (state.ok) {
      setShowForm(false)
      router.refresh()
    }
  }, [state, router])

  const total = client.payments.reduce((s, p) => s + p.amount, 0)
  const today = new Date().toISOString().slice(0, 10)
  const suggested =
    client.suggested > 0
      ? client.suggested.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
      : ""

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Receipt className="size-3.5" />
            Pagamentos
          </button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="size-5 text-primary" />
            Pagamentos · {client.name}
          </DialogTitle>
          <DialogDescription>
            {client.payments.length} pagamento{client.payments.length !== 1 ? "s" : ""} ·{" "}
            {fmtBRL(total)} no total
          </DialogDescription>
        </DialogHeader>

        {!showForm && (
          <Button type="button" size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
            <Plus className="size-4" />
            Registrar pagamento
          </Button>
        )}

        {showForm && (
          <form action={formAction} className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
            <input type="hidden" name="holdingId" value={client.id} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Data do pagamento">
                <Input type="date" name="paidOn" defaultValue={today} required />
              </Field>
              <Field label="Valor (R$)">
                <Input name="amount" inputMode="decimal" placeholder="0,00" defaultValue={suggested} required />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Forma">
                <select
                  name="method"
                  defaultValue={client.method ?? ""}
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
              <Field label="Competência (mês)">
                <Input name="refMonth" type="month" />
              </Field>
            </div>
            <Field label="Observação (opcional)">
              <Input name="note" placeholder="ex.: referente a julho" />
            </Field>
            <label className="flex items-start gap-2 rounded-md border bg-background p-2.5 text-xs">
              <input
                type="checkbox"
                name="markPaid"
                defaultChecked
                className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
              />
              <span>
                <span className="font-medium">
                  Marcar cliente como pago e atualizar o vencimento
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  Tira do teste, remove suspensão e define o próximo vencimento
                  (~1 mês). Desmarque se for só lançar um pagamento no histórico.
                </span>
              </span>
            </label>
            {state.message && !state.ok && (
              <p className="text-xs text-rose-600">{state.message}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <SaveButton />
            </div>
          </form>
        )}

        <div className="max-h-72 overflow-y-auto">
          {client.payments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum pagamento registrado ainda.
            </p>
          ) : (
            <div className="divide-y">
              {client.payments.map((p) => (
                <div key={p.id} className="flex items-center gap-2 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium tabular-nums">{fmtDate(p.paidOn)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {[p.method, p.refMonth, p.note].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <span className="font-semibold tabular-nums text-emerald-600">
                    {fmtBRL(p.amount)}
                  </span>
                  <button
                    type="button"
                    disabled={delPending}
                    onClick={() => startDel(async () => {
                      await deletePayment(p.id)
                      router.refresh()
                    })}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                    title="Excluir"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
    </div>
  )
}

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending} className="gap-1.5">
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
      Salvar
    </Button>
  )
}
