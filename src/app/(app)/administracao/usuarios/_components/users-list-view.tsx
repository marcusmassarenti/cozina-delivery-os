"use client"

import * as React from "react"
import { Building2, UserCog, UsersRound } from "lucide-react"

import { perfilBadge, perfilLabel } from "@/lib/perfis"
import type { AppUser } from "../_actions"
import { DeleteUserButton } from "./delete-user-button"
import { EditUserDialog } from "./edit-user-dialog"
import { NewUserDialog, type UnitOption } from "./new-user-dialog"

type Tab = "internos" | "franqueados"

function formatDate(iso: string | null): string {
  if (!iso) return "Nunca"
  const d = new Date(iso)
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

export function UsersListView({
  users,
  currentUserId,
  units,
}: {
  users: AppUser[]
  currentUserId: string | null
  units: UnitOption[]
}) {
  const [tab, setTab] = React.useState<Tab>("internos")

  const internos = users.filter((u) => u.perfil === "administrador")
  const franqueados = users.filter((u) => u.perfil === "franqueado")
  const filtered = tab === "internos" ? internos : franqueados

  return (
    <>
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <UsersRound className="size-6 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">
              Gestão de Usuários
            </h1>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Cadastre, gerencie e atribua permissões aos usuários do sistema.
          </p>
        </div>
        <NewUserDialog units={units} />
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <TabButton
          active={tab === "internos"}
          onClick={() => setTab("internos")}
          icon={<UserCog className="size-3.5" />}
          label="Equipe Cozina"
          count={internos.length}
        />
        <TabButton
          active={tab === "franqueados"}
          onClick={() => setTab("franqueados")}
          icon={<Building2 className="size-3.5" />}
          label="Franqueados"
          count={franqueados.length}
        />
      </div>

      {/* Tabela */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-12 text-center">
          <p className="text-sm font-medium">
            {tab === "internos"
              ? "Nenhum usuário da equipe ainda"
              : "Nenhum franqueado ainda"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Clique em &quot;+ Novo Usuário&quot; pra cadastrar.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_108px] items-center gap-4 border-b px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <div>Nome</div>
            <div>Email</div>
            <div className="text-center">Perfil</div>
            <div>Criado</div>
            <div>Último acesso</div>
            <div></div>
          </div>

          {filtered.map((u, idx) => {
            const isSelf = currentUserId === u.id
            return (
              <div
                key={u.id}
                className={`grid grid-cols-[minmax(0,1.5fr)_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_108px] items-center gap-4 px-5 py-3 text-sm transition-colors hover:bg-muted/30 ${
                  idx < filtered.length - 1 ? "border-b" : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">
                    {u.fullName ?? "—"}
                  </span>
                  {isSelf && (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                      Você
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {u.email}
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${perfilBadge(
                      u.perfil,
                    )}`}
                  >
                    {perfilLabel(u.perfil)}
                  </span>
                  {u.perfil === "franqueado" && u.unitCode && (
                    <span className="text-[10px] text-muted-foreground">
                      #{u.unitCode} · {u.unitName?.split(" — ")[1] ?? u.unitName}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(u.createdAt)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(u.lastSignInAt)}
                </div>
                <div className="flex items-center gap-0.5">
                  <EditUserDialog user={u} units={units} />
                  <DeleteUserButton
                    userId={u.id}
                    userName={u.fullName}
                    userEmail={u.email}
                    isSelf={isSelf}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-primary bg-primary/5 text-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-muted"
      }`}
    >
      {icon}
      {label}
      <span
        className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
          active
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {count}
      </span>
    </button>
  )
}
