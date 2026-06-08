"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import Link from "next/link"
import { ArrowRight, Lock, User } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { signIn, type SignInState } from "../_actions"

const initial: SignInState = { ok: false }

export function LoginForm() {
  const [state, formAction] = useActionState(signIn, initial)
  const [remember, setRemember] = React.useState(false)

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Email
        </Label>
        <div className="relative">
          <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="seu@email.com"
            autoComplete="email"
            required
            className="h-11 pl-9"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Senha
        </Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="••••••••••••"
            autoComplete="current-password"
            required
            className="h-11 pl-9"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="size-4 rounded border-border"
          />
          <span className="text-muted-foreground">Lembrar meu email</span>
        </label>
        <Link
          href="/esqueci-senha"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Esqueci minha senha
        </Link>
      </div>

      {state.message && !state.ok && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          {state.message}
        </div>
      )}

      <SubmitButton />
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-11 text-sm font-semibold"
    >
      {pending ? "Entrando..." : "Entrar"}
      {!pending && <ArrowRight className="ml-1 size-4" />}
    </Button>
  )
}
