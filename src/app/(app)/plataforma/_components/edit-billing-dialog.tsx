"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { Pencil } from "lucide-react"

import { fmtBRL } from "@/lib/format"
import { Button } from "@/components/ui/button"
import {
  TIPOS_CLIENTE,
  normalizaTipoCliente,
} from "@/lib/tipos-cliente"
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
  pricePerUnit: number | null
  includedUnits: number
  billableUnits: number
  dueDate: string | null
  paid: boolean
  suspendOn: string | null
}

const initial: BillingActionState = { ok: false }

const fmtMoney = (v: string): string => {
  const n = parseFloat(v.replace(/\./g, "").replace(",", "."))
  if (!isFinite(n)) return ""
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const parseMoney = (v: string): number => {
  const n = parseFloat(v.replace(/\./g, "").replace(",", "."))
  return isFinite(n) ? n : 0
}

export function EditBillingDialog({
  client,
  compact = false,
}: {
  client: BillingClient
  compact?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [state, formAction] = useActionState(setClientBilling, initial)
  const [paid, setPaid] = React.useState(client.paid)
  const [fee, setFee] = React.useState(
    client.monthlyFee != null
      ? client.monthlyFee.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
      : "",
  )
  const [ppu, setPpu] = React.useState(
    client.pricePerUnit != null
      ? client.pricePerUnit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
      : "",
  )
  const [included, setIncluded] = React.useState(String(client.includedUnits))
  const router = useRouter()

  React.useEffect(() => {
    if (state.ok) {
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  const extras = Math.max(0, client.billableUnits - (Number(included) || 0))
  const total = parseMoney(fee) + extras * parseMoney(ppu)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            title="Editar cobrança"
            aria-label="Editar cobrança"
            className={`inline-flex items-center gap-1.5 rounded-md border ${compact ? "px-2 py-1.5" : "px-2.5 py-1.5"} text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground`}
          >
            <Pencil className="size-3.5" />
            {!compact && "Editar"}
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
            Cadastro e cobrança. A mensalidade é a base + as lojas além das inclusas.
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
                defaultValue={normalizaTipoCliente(client.establishmentType) ?? ""}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                <option value="">—</option>
                {TIPOS_CLIENTE.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* Sem seletor de forma de pagamento: quem responde isso é a
              assinatura do Asaas, não alguém digitando. O campo escrito à mão
              mentia — esta conta chegou a exibir "Boleto" sem nunca ter tido
              boleto nenhum. */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vencimento">
              <Input type="date" name="dueDate" defaultValue={client.dueDate ?? ""} />
            </Field>
          </div>

          {/* PREÇO NEGOCIADO — exceção, não regra.
              O normal é o cliente pagar a tabela do plano (Preços dos planos,
              no topo da tela), recalculada sozinha conforme ele abre e fecha
              loja. Estes campos SOBRESCREVEM isso e param de acompanhar o
              plano — foi assim que a DG Foods ficou com 23 lojas e R$ 0/mês,
              porque estavam vazios e mesmo assim mandavam no cálculo. */}
          <details className="rounded-lg border border-dashed p-3">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              Preço negociado (fora da tabela)
            </summary>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Deixe em branco pra cobrar pelo plano. Preenchendo, este cliente
              passa a ter valor fixo e não acompanha mais a tabela nem a
              quantidade de lojas.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Field label="Valor base (R$)">
                <Input
                  name="monthlyFee"
                  inputMode="decimal"
                  placeholder="usar o plano"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                  onBlur={(e) => setFee(fmtMoney(e.target.value))}
                />
              </Field>
              <Field label="Valor por loja extra (R$)">
                <Input
                  name="pricePerUnit"
                  inputMode="decimal"
                  placeholder="usar o plano"
                  value={ppu}
                  onChange={(e) => setPpu(e.target.value)}
                  onBlur={(e) => setPpu(fmtMoney(e.target.value))}
                />
              </Field>
              <Field label="Lojas inclusas na base">
                <Input
                  name="includedUnits"
                  type="number"
                  min={0}
                  value={included}
                  onChange={(e) => setIncluded(e.target.value)}
                />
              </Field>
            </div>
            {fee.trim() !== "" && (
              <div className="mt-2.5 flex items-center justify-between border-t pt-2.5 text-sm">
                <span className="text-muted-foreground">
                  {client.billableUnits} loja{client.billableUnits !== 1 ? "s" : ""} ativa
                  {client.billableUnits !== 1 ? "s" : ""}
                  {extras > 0 ? ` · ${extras} extra${extras !== 1 ? "s" : ""}` : ""}
                </span>
                <span className="font-semibold tabular-nums">
                  Total: {fmtBRL(total)}/mês
                </span>
              </div>
            )}
          </details>

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
              <Input type="date" name="suspendOn" defaultValue={client.suspendOn ?? ""} />
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
