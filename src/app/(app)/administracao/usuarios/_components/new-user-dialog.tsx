"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { Check, UserPlus } from "lucide-react"

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
import { createUser, type UserActionState } from "../_actions"

const initial: UserActionState = { ok: false }

export type UnitOption = { id: string; code: string; name: string }
export type RoleOption = {
  key: string
  label: string
  dataScope: "holding" | "unit"
}

export function NewUserDialog({
  units,
  roles,
}: {
  units: UnitOption[]
  roles: RoleOption[]
}) {
  const defaultRole =
    roles.find((r) => r.key === "franqueado")?.key ?? roles[0]?.key ?? ""
  const [open, setOpen] = React.useState(false)
  const [state, formAction] = useActionState(createUser, initial)
  const [perfil, setPerfil] = React.useState<string>(defaultRole)
  const [unitIds, setUnitIds] = React.useState<string[]>([])
  const [storeMode, setStoreMode] = React.useState<"new" | "existing">("new")
  const router = useRouter()

  React.useEffect(() => {
    if (state.ok) {
      setOpen(false)
      setPerfil(defaultRole)
      setUnitIds([])
      setStoreMode("new")
      router.refresh()
    }
  }, [state, router, defaultRole])

  const showUnit =
    roles.find((r) => r.key === perfil)?.dataScope === "unit"

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <UserPlus className="size-3.5" />
            Novo Usuário
          </button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-primary" />
            Novo Usuário
          </DialogTitle>
          <DialogDescription>
            Cadastre um usuário e atribua um perfil de acesso.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <Field label="Nome" error={state.fieldErrors?.fullName}>
            <Input
              name="fullName"
              placeholder="ex.: Marcus Massarenti"
              required
            />
          </Field>

          <Field label="Email" error={state.fieldErrors?.email}>
            <Input
              name="email"
              type="email"
              placeholder="usuario@cozinafoods.com"
              required
            />
          </Field>

          <Field label="Senha" error={state.fieldErrors?.password}>
            <Input
              name="password"
              type="password"
              placeholder="Pelo menos 6 caracteres"
              required
              minLength={6}
            />
          </Field>

          <Field label="Perfil de Acesso">
            <Select value={perfil} onValueChange={(v) => setPerfil(v ?? "")}>
              <SelectTrigger>
                <SelectValue>
                  {(v) => roles.find((r) => r.key === v)?.label ?? ""}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="perfil" value={perfil} />
            <p className="text-[10px] text-muted-foreground">
              {showUnit
                ? "Acesso somente à(s) loja(s) vinculada(s)."
                : "Acesso à rede toda."}
            </p>
          </Field>

          {showUnit && (
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
              <input type="hidden" name="storeMode" value={storeMode} />
              <div className="grid grid-cols-2 gap-1.5 rounded-md bg-muted p-1">
                {(["new", "existing"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setStoreMode(m)}
                    className={`rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                      storeMode === m
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m === "new" ? "Nova loja" : "Loja existente"}
                  </button>
                ))}
              </div>

              {storeMode === "new" ? (
                <>
                  <Field
                    label="Nome da loja"
                    error={state.fieldErrors?.storeName}
                  >
                    <Input name="storeName" placeholder="ex.: Unidade Centro" />
                  </Field>
                  <div className="grid grid-cols-[1fr_5rem] gap-3">
                    <Field label="Cidade">
                      <Input name="storeCity" placeholder="São Paulo" />
                    </Field>
                    <Field label="UF" error={state.fieldErrors?.storeUf}>
                      <Input
                        name="storeUf"
                        placeholder="SP"
                        maxLength={2}
                        className="uppercase"
                      />
                    </Field>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Cria a loja e vincula o franqueado a ela — acesso só a essa
                    unidade. Cada loja aceita até 5 usuários.
                  </p>
                </>
              ) : (
                <Field
                  label="Loja do franqueado"
                  error={state.fieldErrors?.unitId}
                >
                  <UnitMultiSelect
                    units={units}
                    selected={unitIds}
                    onToggle={(id) =>
                      setUnitIds((prev) =>
                        prev.includes(id)
                          ? prev.filter((x) => x !== id)
                          : [...prev, id],
                      )
                    }
                  />
                </Field>
              )}
            </div>
          )}

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

/**
 * Lista de lojas com checkbox (multi-seleção). Renderiza um <input
 * type="hidden" name="unitIds"> por loja marcada, então o form action lê via
 * formData.getAll("unitIds"). Usado no criar e no editar usuário.
 */
export function UnitMultiSelect({
  units,
  selected,
  onToggle,
}: {
  units: UnitOption[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <>
      <div className="max-h-44 divide-y overflow-y-auto rounded-md border">
        {units.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            Nenhuma loja cadastrada.
          </p>
        )}
        {units.map((u) => {
          const checked = selected.includes(u.id)
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => onToggle(u.id)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50"
            >
              <span
                className={`flex size-4 shrink-0 items-center justify-center rounded border transition-colors ${
                  checked
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background"
                }`}
              >
                {checked && <Check className="size-3" />}
              </span>
              <span className="truncate">
                <span className="font-medium">#{u.code}</span> · {u.name}
              </span>
            </button>
          )
        })}
      </div>
      {selected.map((id) => (
        <input key={id} type="hidden" name="unitIds" value={id} />
      ))}
      <p className="text-[10px] text-muted-foreground">
        {selected.length} loja{selected.length !== 1 ? "s" : ""} selecionada
        {selected.length !== 1 ? "s" : ""}
      </p>
    </>
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
      {pending ? "Criando..." : "Criar usuário"}
    </Button>
  )
}
