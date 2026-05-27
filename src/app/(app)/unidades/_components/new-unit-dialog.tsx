"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createUnit, type CreateUnitState } from "../_actions"

const UFs = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]

const PLATFORMS: { id: PlatformId; label: string }[] = [
  { id: "ifood", label: "iFood" },
  { id: "99food", label: "99 Food" },
  { id: "keeta", label: "Keeta" },
]

const initial: CreateUnitState = { ok: false }

function maskCnpj(v: string) {
  const digits = v.replace(/\D/g, "").slice(0, 14)
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2")
}

export function NewUnitDialog() {
  const [open, setOpen] = React.useState(false)
  const [state, formAction] = useActionState(createUnit, initial)
  const [cnpj, setCnpj] = React.useState("")
  const [uf, setUf] = React.useState("SP")
  const router = useRouter()

  React.useEffect(() => {
    if (state.ok) {
      setOpen(false)
      setCnpj("")
      setUf("SP")
      router.refresh()
    }
  }, [state, router])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="size-3.5" />
            Nova Unidade
          </button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova unidade</DialogTitle>
          <DialogDescription>
            Cadastre uma franquia da rede Churrasco no Pote. O código é gerado
            automaticamente.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <Field label="Nome" error={state.fieldErrors?.name}>
            <Input
              name="name"
              placeholder="ex.: Churrasco no Pote — JK"
              required
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Cidade" error={state.fieldErrors?.city}>
                <Input name="city" placeholder="ex.: São Paulo" required />
              </Field>
            </div>
            <div>
              <Field label="UF" error={state.fieldErrors?.state}>
                <Select value={uf} onValueChange={setUf}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UFs.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input type="hidden" name="state" value={uf} />
              </Field>
            </div>
          </div>

          <Field label="CNPJ (opcional)" error={state.fieldErrors?.cnpj}>
            <Input
              name="cnpj"
              placeholder="00.000.000/0000-00"
              value={cnpj}
              onChange={(e) => setCnpj(maskCnpj(e.target.value))}
              maxLength={18}
            />
          </Field>

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-medium">Plataformas ativas</Label>
            <div className="grid grid-cols-3 gap-2">
              {PLATFORMS.map((p) => (
                <PlatformCheckbox key={p.id} platform={p} />
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Marque as plataformas onde essa loja opera. Pode mudar depois.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="active"
              name="active"
              type="checkbox"
              defaultChecked
              className="size-4 rounded border-border"
            />
            <Label
              htmlFor="active"
              className="cursor-pointer text-sm font-normal"
            >
              Unidade ativa (recebendo pedidos)
            </Label>
          </div>

          {state.message && !state.ok && (
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
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PlatformCheckbox({
  platform,
}: {
  platform: { id: PlatformId; label: string }
}) {
  const [checked, setChecked] = React.useState(true)
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-xs font-medium transition-colors ${
        checked
          ? "border-primary bg-primary/5"
          : "border-border bg-card opacity-60 hover:opacity-100"
      }`}
    >
      <input
        type="checkbox"
        name="platforms"
        value={platform.id}
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
        className="size-3.5 rounded border-border"
      />
      <PlatformLogo platform={platform.id} size="sm" />
      <span>{platform.label}</span>
    </label>
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
      {pending ? "Salvando..." : "Criar unidade"}
    </Button>
  )
}
