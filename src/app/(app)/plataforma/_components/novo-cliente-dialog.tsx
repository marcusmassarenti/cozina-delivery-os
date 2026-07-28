"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { Building2, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TIPOS_CLIENTE } from "@/lib/tipos-cliente"
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
import { criarCliente, type CriarClienteState } from "../_actions"

const initial: CriarClienteState = { ok: false }

export function NovoClienteDialog() {
  const [open, setOpen] = React.useState(false)
  const [state, formAction] = useActionState(criarCliente, initial)
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
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            <Plus className="size-4" />
            Novo cliente
          </button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="size-5 text-primary" />
            Novo cliente
          </DialogTitle>
          <DialogDescription>
            Cria a empresa, a 1ª loja e o usuário admin dela. O admin entra
            vendo só a própria empresa.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <Field label="Nome da empresa" error={state.fieldErrors?.empresa}>
            <Input name="empresa" placeholder="ex.: Burguer do João Ltda" required />
          </Field>

          <Field label="Tipo de estabelecimento">
            <select
              name="establishmentType"
              defaultValue=""
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

          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Administrador da empresa
            </p>
            <div className="flex flex-col gap-3">
              <Field label="Nome" error={state.fieldErrors?.adminNome}>
                <Input name="adminNome" placeholder="ex.: João Silva" required />
              </Field>
              <Field label="E-mail" error={state.fieldErrors?.adminEmail}>
                <Input
                  name="adminEmail"
                  type="email"
                  placeholder="joao@empresa.com"
                  required
                />
              </Field>
              <Field label="Senha temporária" error={state.fieldErrors?.adminSenha}>
                <Input
                  name="adminSenha"
                  type="text"
                  placeholder="Pelo menos 6 caracteres"
                  required
                  minLength={6}
                />
              </Field>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Primeira loja
            </p>
            <div className="flex flex-col gap-3">
              <Field label="Nome da loja" error={state.fieldErrors?.lojaNome}>
                <Input name="lojaNome" placeholder="ex.: Matriz Centro" required />
              </Field>
              <div className="grid grid-cols-[1fr_80px] gap-2">
                <Field label="Cidade">
                  <Input name="lojaCidade" placeholder="ex.: São Paulo" />
                </Field>
                <Field label="UF" error={state.fieldErrors?.lojaUf}>
                  <Input name="lojaUf" placeholder="SP" maxLength={2} />
                </Field>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cobrança (opcional)
            </p>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Valor mensal (R$)">
                  <Input
                    name="monthlyFee"
                    inputMode="decimal"
                    placeholder="ex.: 199,90"
                  />
                </Field>
              </div>
              <Field label="Vencimento">
                <Input type="date" name="dueDate" />
              </Field>
            </div>
          </div>

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
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {error && (
        <span className="text-[11px] text-rose-600 dark:text-rose-400">
          {error}
        </span>
      )}
    </div>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Criando..." : "Criar cliente"}
    </Button>
  )
}
