"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import Link from "next/link"
import { ArrowRight, Eye, EyeOff, Lock, User } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { signIn, type SignInState } from "../_actions"
import { TurnstileWidget, resetTurnstile } from "./turnstile-widget"

const initial: SignInState = { ok: false }

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(signIn, initial)
  const [remember, setRemember] = React.useState(false)
  const [showPassword, setShowPassword] = React.useState(false)

  // Login recusado → pede um token novo ao Turnstile. Sem isto a 2ª tentativa
  // reenvia o token já queimado e falha por "verificação expirada" mesmo com a
  // senha certa. Ver o comentário em `resetTurnstile`.
  //
  // Só no caminho de ERRO: quando o login dá certo a página navega e o widget
  // sai de cena junto.
  React.useEffect(() => {
    if (state.ok || !state.message) return
    resetTurnstile()
  }, [state])

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {/* Destino depois do login. Vem de quem mandou o lojista pra cá (ex.: o
          "Instalar" da CW App Store) — sem isto, ele entra e cai no dashboard
          sem lembrança do que estava tentando fazer. */}
      {next && <input type="hidden" name="next" value={next} />}
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
            type={showPassword ? "text" : "password"}
            placeholder="••••••••••••"
            autoComplete="current-password"
            required
            className="h-11 pl-9 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            title={showPassword ? "Ocultar senha" : "Mostrar senha"}
            className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {showPassword ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
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

      {/* Só aparece se o Turnstile estiver configurado. */}
      <TurnstileWidget />

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
