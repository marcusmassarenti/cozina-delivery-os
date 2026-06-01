"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { Pencil, Shield } from "lucide-react"

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
import { updateUser, type AppUser, type UserActionState } from "../_actions"
import type { UnitOption, RoleOption } from "./new-user-dialog"

const initial: UserActionState = { ok: false }

export function EditUserDialog({
  user,
  units,
  roles,
}: {
  user: AppUser
  units: UnitOption[]
  roles: RoleOption[]
}) {
  const [open, setOpen] = React.useState(false)
  const [state, formAction] = useActionState(updateUser, initial)
  // Perfil atual do usuário se ainda existir; senão cai pro 1º disponível.
  const initialPerfil = roles.some((r) => r.key === user.perfil)
    ? user.perfil
    : (roles[0]?.key ?? "")
  const [perfil, setPerfil] = React.useState<string>(initialPerfil)
  const [unitId, setUnitId] = React.useState<string>(user.unitId ?? "")
  const router = useRouter()

  React.useEffect(() => {
    if (state.ok) {
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  const showUnit =
    roles.find((r) => r.key === perfil)?.dataScope === "unit"

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label="Editar usuário"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="size-5 text-primary" />
            Editar Usuário
          </DialogTitle>
          <DialogDescription>
            Altere os dados do usuário. Deixe a senha em branco para manter a
            atual.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="userId" value={user.id} />

          <Field label="Nome" error={state.fieldErrors?.fullName}>
            <Input
              name="fullName"
              defaultValue={user.fullName ?? ""}
              placeholder="ex.: Marcus Massarenti"
              required
            />
          </Field>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Email</Label>
            <Input
              value={user.email}
              disabled
              className="bg-muted/50 text-muted-foreground"
            />
            <span className="text-[10px] text-muted-foreground">
              Email não pode ser alterado pela interface.
            </span>
          </div>

          <Field
            label="Senha (deixe em branco para manter)"
            error={state.fieldErrors?.password}
          >
            <Input
              name="password"
              type="password"
              placeholder="Nova senha (opcional)"
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
            <Field
              label="Unidade vinculada"
              error={state.fieldErrors?.unitId}
            >
              <Select value={unitId} onValueChange={(v) => setUnitId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a unidade" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      #{u.code} · {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="unitId" value={unitId} />
            </Field>
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
      <Pencil className="mr-1 size-3.5" />
      {pending ? "Salvando..." : "Salvar Alterações"}
    </Button>
  )
}
