"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  Check,
  Lock,
  Plus,
  ShieldCheck,
  Store,
  Trash2,
  Network,
} from "lucide-react"

import { cn } from "@/lib/utils"
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
import { saveRole, createRole, deleteRole } from "../_actions"

type Action = "view" | "edit" | "delete"
type ModulePerm = { view: boolean; edit: boolean; delete: boolean }
type DataScope = "holding" | "unit"

type Role = {
  id: string
  key: string
  label: string
  description: string | null
  isSystem: boolean
  dataScope: DataScope
  sortOrder: number
  perms: Record<string, ModulePerm>
}
type Mod = { key: string; label: string; actions: Action[] }

const ACTIONS: Action[] = ["view", "edit", "delete"]
const ACTION_LABEL: Record<Action, string> = {
  view: "Ver",
  edit: "Editar",
  delete: "Apagar",
}

const EMPTY: ModulePerm = { view: false, edit: false, delete: false }

const SCOPE_LABEL: Record<DataScope, string> = {
  holding: "Rede toda",
  unit: "Só a própria loja",
}

export function PermissionsManager({
  roles,
  modules,
}: {
  roles: Role[]
  modules: Mod[]
}) {
  const router = useRouter()
  const [selectedId, setSelectedId] = React.useState(roles[0]?.id ?? "")
  const selected = roles.find((r) => r.id === selectedId) ?? roles[0]
  const isAdmin = selected?.key === "administrador"

  const [scope, setScope] = React.useState<DataScope>(
    selected?.dataScope ?? "holding",
  )
  const [perms, setPerms] = React.useState<Record<string, ModulePerm>>({})
  const [saving, setSaving] = React.useState(false)
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(
    null,
  )

  // Reseta o rascunho ao trocar de perfil OU quando os dados recarregam (refresh).
  React.useEffect(() => {
    if (!selected) return
    setScope(selected.dataScope)
    const p: Record<string, ModulePerm> = {}
    for (const m of modules) {
      const cur = selected.perms[m.key]
      p[m.key] = {
        view: !!cur?.view,
        edit: !!cur?.edit,
        delete: !!cur?.delete,
      }
    }
    setPerms(p)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, roles])

  function selectRole(id: string) {
    setSelectedId(id)
    setMsg(null)
  }

  function toggle(modKey: string, action: Action) {
    if (isAdmin) return
    setMsg(null)
    setPerms((prev) => {
      const m = prev[modKey] ?? { ...EMPTY }
      const next = { ...m, [action]: !m[action] }
      // Regra: editar/apagar exige ver; tirar "ver" tira o resto.
      if ((action === "edit" || action === "delete") && next[action]) {
        next.view = true
      }
      if (action === "view" && !next.view) {
        next.edit = false
        next.delete = false
      }
      return { ...prev, [modKey]: next }
    })
  }

  const dirty =
    !!selected &&
    !isAdmin &&
    (scope !== selected.dataScope ||
      modules.some((m) => {
        const a = perms[m.key] ?? EMPTY
        const b = selected.perms[m.key] ?? EMPTY
        return (
          a.view !== !!b.view ||
          a.edit !== !!b.edit ||
          a.delete !== !!b.delete
        )
      }))

  async function onSave() {
    if (!selected || isAdmin) return
    setSaving(true)
    setMsg(null)
    const res = await saveRole({
      roleId: selected.id,
      dataScope: scope,
      perms: modules.map((m) => ({
        module: m.key,
        ...(perms[m.key] ?? EMPTY),
      })),
    })
    setSaving(false)
    if (res.ok) {
      setMsg({ ok: true, text: "Permissões salvas." })
      router.refresh()
    } else {
      setMsg({ ok: false, text: res.message ?? "Erro ao salvar." })
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ShieldCheck className="size-6 text-primary" />
            Gestão de Permissões
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Defina o que cada perfil pode ver, editar e apagar — e crie perfis
            sob medida.
          </p>
        </div>
        <NewRoleDialog onCreated={(id) => selectRole(id)} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_1fr]">
        {/* Trilha de perfis */}
        <div className="flex flex-col gap-1.5">
          {roles.map((r) => {
            const active = r.id === selectedId
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => selectRole(r.id)}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                  active
                    ? "border-primary/40 bg-primary/5 font-medium"
                    : "border-border bg-card hover:bg-muted",
                )}
              >
                <span className="flex items-center gap-2 truncate">
                  {r.dataScope === "holding" ? (
                    <Network className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <Store className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{r.label}</span>
                </span>
                {r.isSystem && (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                    sistema
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Editor do perfil selecionado */}
        {selected && (
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{selected.label}</h2>
                {selected.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {selected.description}
                  </p>
                )}
              </div>
              {!selected.isSystem && (
                <DeleteRoleButton
                  roleId={selected.id}
                  label={selected.label}
                  onDeleted={() => {
                    setSelectedId(roles[0]?.id ?? "")
                    router.refresh()
                  }}
                />
              )}
            </div>

            {isAdmin && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                <Lock className="size-3.5 shrink-0" />
                O Administrador tem acesso total e não é editável — garante que
                sempre exista um perfil que não trava o sistema.
              </div>
            )}

            {/* Escopo de dados */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">Escopo de dados</Label>
              <Select
                value={scope}
                onValueChange={(v) => {
                  if (isAdmin) return
                  setScope((v as DataScope) ?? "holding")
                  setMsg(null)
                }}
                disabled={isAdmin}
              >
                <SelectTrigger className="max-w-xs">
                  <SelectValue>
                    {(v) => SCOPE_LABEL[v as DataScope] ?? ""}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="holding">
                    Rede toda (vê todas as lojas)
                  </SelectItem>
                  <SelectItem value="unit">
                    Só a própria loja (vinculada ao usuário)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Matriz */}
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Tela</th>
                    {ACTIONS.map((a) => (
                      <th
                        key={a}
                        className="w-20 px-2 py-2 text-center font-medium"
                      >
                        {ACTION_LABEL[a]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modules.map((m) => {
                    const p = perms[m.key] ?? EMPTY
                    return (
                      <tr key={m.key} className="border-b last:border-0">
                        <td className="px-3 py-2.5 font-medium">{m.label}</td>
                        {ACTIONS.map((a) => {
                          const applicable = m.actions.includes(a)
                          const active = isAdmin ? applicable : p[a]
                          return (
                            <td key={a} className="px-2 py-2.5 text-center">
                              <PermCell
                                applicable={applicable}
                                active={!!active}
                                disabled={isAdmin}
                                onToggle={() => toggle(m.key, a)}
                              />
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Barra de salvar */}
            {!isAdmin && (
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs">
                  {msg ? (
                    <span
                      className={cn(
                        msg.ok
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400",
                      )}
                    >
                      {msg.text}
                    </span>
                  ) : dirty ? (
                    <span className="text-muted-foreground">
                      Alterações não salvas.
                    </span>
                  ) : null}
                </div>
                <Button onClick={onSave} disabled={!dirty || saving}>
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function PermCell({
  applicable,
  active,
  disabled,
  onToggle,
}: {
  applicable: boolean
  active: boolean
  disabled: boolean
  onToggle: () => void
}) {
  if (!applicable) {
    return <span className="text-muted-foreground/30">—</span>
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-md border transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background hover:bg-muted",
        disabled && "cursor-not-allowed opacity-70",
      )}
    >
      {active && <Check className="size-4" />}
    </button>
  )
}

function NewRoleDialog({ onCreated }: { onCreated: (id: string) => void }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [label, setLabel] = React.useState("")
  const [scope, setScope] = React.useState<DataScope>("holding")
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)

  async function submit() {
    if (!label.trim()) {
      setErr("Dê um nome ao perfil.")
      return
    }
    setBusy(true)
    setErr(null)
    const res = await createRole({ label: label.trim(), dataScope: scope })
    setBusy(false)
    if (res.ok) {
      setOpen(false)
      setLabel("")
      setScope("holding")
      router.refresh()
      if (res.roleId) onCreated(res.roleId)
    } else {
      setErr(res.message ?? "Erro ao criar.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="size-3.5" />
            Novo perfil
          </button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            Novo perfil
          </DialogTitle>
          <DialogDescription>
            A matriz começa toda em &ldquo;não&rdquo; — você liga o que ele pode
            depois.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Nome do perfil</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ex.: Supervisor Regional"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Escopo de dados</Label>
            <Select
              value={scope}
              onValueChange={(v) => setScope((v as DataScope) ?? "holding")}
            >
              <SelectTrigger>
                <SelectValue>
                  {(v) => SCOPE_LABEL[v as DataScope] ?? ""}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="holding">Rede toda</SelectItem>
                <SelectItem value="unit">Só a própria loja</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {err && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
              {err}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={submit} disabled={busy}>
            {busy ? "Criando..." : "Criar perfil"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteRoleButton({
  roleId,
  label,
  onDeleted,
}: {
  roleId: string
  label: string
  onDeleted: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setErr(null)
    const res = await deleteRole(roleId)
    setBusy(false)
    if (res.ok) {
      setOpen(false)
      onDeleted()
    } else {
      setErr(res.message ?? "Erro ao apagar.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/30 px-2.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="size-3.5" />
            Apagar perfil
          </button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Apagar &ldquo;{label}&rdquo;?</DialogTitle>
          <DialogDescription>
            Essa ação não pode ser desfeita. Usuários nesse perfil precisam ser
            movidos antes.
          </DialogDescription>
        </DialogHeader>
        {err && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
            {err}
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
          <Button
            type="button"
            variant="destructive"
            onClick={confirm}
            disabled={busy}
          >
            {busy ? "Apagando..." : "Apagar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
