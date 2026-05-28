"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { UserPlus } from "lucide-react"

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
import { PERFIS, perfilRequiresUnit, type PerfilId } from "@/lib/perfis"
import { createUser, type UserActionState } from "../_actions"

const initial: UserActionState = { ok: false }

export type UnitOption = { id: string; code: string; name: string }

export function NewUserDialog({ units }: { units: UnitOption[] }) {
  const [open, setOpen] = React.useState(false)
  const [state, formAction] = useActionState(createUser, initial)
  const [perfil, setPerfil] = React.useState<PerfilId>("franqueado")
  const [unitId, setUnitId] = React.useState<string>("")
  const router = useRouter()

  React.useEffect(() => {
    if (state.ok) {
      setOpen(false)
      setPerfil("franqueado")
      setUnitId("")
      router.refresh()
    }
  }, [state, router])

  const showUnit = perfilRequiresUnit(perfil)

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
            <Select
              value={perfil}
              onValueChange={(v) => setPerfil(v as PerfilId)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERFIS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="perfil" value={perfil} />
            <p className="text-[10px] text-muted-foreground">
              {perfil === "administrador"
                ? "Acesso a toda a rede (equipe Cozina)."
                : "Acesso somente à própria unidade (cliente)."}
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
      {pending ? "Criando..." : "Criar usuário"}
    </Button>
  )
}
