"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowRight, CheckCircle2, Loader2, Lock, TriangleAlert } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { DeliveryOsWordmark } from "@/components/delivery-os-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Phase = "loading" | "ready" | "invalid" | "done"

export default function RedefinirSenhaPage() {
  const supabase = React.useMemo(() => createClient(), [])
  const router = useRouter()
  const [phase, setPhase] = React.useState<Phase>("loading")
  const [pw, setPw] = React.useState("")
  const [pw2, setPw2] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  // O browser client (detectSessionInUrl) processa o token do link de
  // recuperação automaticamente e estabelece a sessão. Esperamos isso.
  React.useEffect(() => {
    let settled = false
    const ready = () => {
      if (!settled) {
        settled = true
        setPhase("ready")
      }
    }
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) ready()
    })
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) ready()
    })
    const t = setTimeout(() => {
      if (!settled) setPhase("invalid")
    }, 3500)
    return () => {
      sub.subscription.unsubscribe()
      clearTimeout(t)
    }
  }, [supabase])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (pw.length < 6) {
      setError("A senha precisa de pelo menos 6 caracteres.")
      return
    }
    if (pw !== pw2) {
      setError("As senhas não conferem.")
      return
    }
    setSaving(true)
    const { error: upErr } = await supabase.auth.updateUser({ password: pw })
    setSaving(false)
    if (upErr) {
      setError(upErr.message)
      return
    }
    setPhase("done")
    setTimeout(() => router.push("/inicio"), 1800)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <DeliveryOsWordmark subtitle={false} />
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          {phase === "loading" && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Validando seu link...
              </p>
            </div>
          )}

          {phase === "invalid" && (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <TriangleAlert className="size-7 text-amber-500" />
              <h1 className="text-base font-semibold">Link inválido ou expirado</h1>
              <p className="text-sm text-muted-foreground">
                Esse link de recuperação não é mais válido. Solicite um novo.
              </p>
              <Link href="/esqueci-senha" className="mt-2 w-full">
                <Button className="h-11 w-full text-sm font-semibold">
                  Pedir novo link
                </Button>
              </Link>
            </div>
          )}

          {phase === "done" && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <CheckCircle2 className="size-7 text-emerald-600 dark:text-emerald-400" />
              <h1 className="text-base font-semibold">Senha alterada!</h1>
              <p className="text-sm text-muted-foreground">
                Pronto. Entrando no sistema...
              </p>
            </div>
          )}

          {phase === "ready" && (
            <>
              <h1 className="text-lg font-semibold">Criar nova senha</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Defina a nova senha da sua conta.
              </p>
              <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4">
                <Field label="Nova senha">
                  <PwInput value={pw} onChange={setPw} autoComplete="new-password" />
                </Field>
                <Field label="Confirmar nova senha">
                  <PwInput value={pw2} onChange={setPw2} autoComplete="new-password" />
                </Field>
                {error && (
                  <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
                    {error}
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={saving}
                  className="h-11 text-sm font-semibold"
                >
                  {saving ? "Salvando..." : "Salvar nova senha"}
                  {!saving && <ArrowRight className="ml-1 size-4" />}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

function PwInput({
  value,
  onChange,
  autoComplete,
}: {
  value: string
  onChange: (v: string) => void
  autoComplete?: string
}) {
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="••••••••••••"
        autoComplete={autoComplete}
        required
        minLength={6}
        className="h-11 pl-9"
      />
    </div>
  )
}
