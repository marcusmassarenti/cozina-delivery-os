"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { Check, KeyRound, ShieldCheck, ShieldOff, Smartphone } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import {
  confirmarFator2FA,
  desativar2FA,
  iniciarCadastro2FA,
  type EnrollState,
  type VerifyState,
} from "../_actions"

const enrollInicial: EnrollState = { ok: false }
const verifyInicial: VerifyState = { ok: false }

/**
 * Cartão de verificação em duas etapas.
 *
 * Dois estados: DESLIGADO (mostra o passo a passo pra ativar) e LIGADO (mostra
 * o selo e a opção de desativar, que também exige código).
 */
export function MfaCard({
  ativo,
  factorId,
  email,
}: {
  ativo: boolean
  factorId: string | null
  email: string
}) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-start gap-3 border-b p-5">
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-md ${
            ativo
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {ativo ? (
            <ShieldCheck className="size-4" />
          ) : (
            <ShieldOff className="size-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Verificação em duas etapas</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {ativo
              ? "Ativa. Além da senha, o login pede um código do seu aplicativo."
              : "Uma segunda barreira além da senha. Mesmo que alguém descubra sua senha, não entra sem o seu celular."}
          </p>
        </div>
        {ativo && (
          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
            Ativa
          </span>
        )}
      </div>

      <div className="p-5">
        {ativo ? (
          <Desativar factorId={factorId} />
        ) : (
          <Ativar email={email} />
        )}
      </div>
    </div>
  )
}

function Ativar({ email }: { email: string }) {
  const router = useRouter()
  const [enroll, iniciar] = useActionState(iniciarCadastro2FA, enrollInicial)
  const [verify, confirmar] = useActionState(confirmarFator2FA, verifyInicial)

  React.useEffect(() => {
    if (verify.ok) router.refresh()
  }, [verify.ok, router])

  // Etapa 1 — ainda não gerou o QR.
  if (!enroll.ok) {
    return (
      <form action={iniciar} className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          Você vai precisar de um aplicativo autenticador no celular — Google
          Authenticator, Microsoft Authenticator, 1Password ou Authy, por
          exemplo.
        </p>
        {enroll.error && <Erro>{enroll.error}</Erro>}
        <BotaoIniciar />
      </form>
    )
  }

  // Etapa 2 — QR na tela, esperando o primeiro código.
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        <li>
          <b className="text-foreground">1.</b> Abra o app autenticador e escolha
          adicionar uma conta.
        </li>
        <li>
          <b className="text-foreground">2.</b> Aponte a câmera para o código
          abaixo.
        </li>
        <li>
          <b className="text-foreground">3.</b> Digite aqui os 6 dígitos que
          aparecerem.
        </li>
      </ol>

      <div className="flex flex-col items-center gap-3 rounded-lg border bg-background p-4 sm:flex-row sm:items-start">
        {/* O QR vem do Supabase como SVG em data URI. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={enroll.qrCode}
          alt="QR Code para o aplicativo autenticador"
          className="size-40 shrink-0 rounded bg-white p-1"
        />
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-[11px] text-muted-foreground">
            Conta: <b className="text-foreground">{email}</b>
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Não consegue escanear? Digite esta chave no app:
          </p>
          <code className="mt-1 block break-all rounded bg-muted px-2 py-1.5 font-mono text-[11px]">
            {enroll.secret}
          </code>
        </div>
      </div>

      <form action={confirmar} className="flex flex-col gap-2">
        <input type="hidden" name="factorId" value={enroll.factorId} />
        <label
          htmlFor="code"
          className="text-xs font-medium text-muted-foreground"
        >
          Código do aplicativo
        </label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            required
            className="h-10 w-32 text-center font-mono text-base tracking-[0.3em]"
          />
          <BotaoConfirmar />
        </div>
        {verify.error && <Erro>{verify.error}</Erro>}
      </form>
    </div>
  )
}

function Desativar({ factorId }: { factorId: string | null }) {
  const router = useRouter()
  const [state, action] = useActionState(desativar2FA, verifyInicial)
  const [aberto, setAberto] = React.useState(false)

  React.useEffect(() => {
    if (state.ok) router.refresh()
  }, [state.ok, router])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
        <Smartphone className="mt-0.5 size-3.5 shrink-0" />
        <span>
          <b>Guarde bem o acesso ao app.</b> Se trocar de celular sem transferir
          a conta do autenticador, você não conseguirá entrar — será preciso
          pedir a um administrador que desative o 2FA da sua conta.
        </span>
      </div>

      {!aberto ? (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="w-fit text-xs font-medium text-muted-foreground underline transition-colors hover:text-foreground"
        >
          Desativar verificação em duas etapas
        </button>
      ) : (
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="factorId" value={factorId ?? ""} />
          <p className="text-xs text-muted-foreground">
            Digite um código do app para confirmar que é você:
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              required
              className="h-10 w-32 text-center font-mono text-base tracking-[0.3em]"
            />
            <BotaoDesativar />
            <Button
              type="button"
              variant="ghost"
              className="h-10"
              onClick={() => setAberto(false)}
            >
              Cancelar
            </Button>
          </div>
          {state.error && <Erro>{state.error}</Erro>}
        </form>
      )}
    </div>
  )
}

function BotaoIniciar() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="w-fit">
      <KeyRound className="size-4" />
      {pending ? "Gerando..." : "Ativar verificação em duas etapas"}
    </Button>
  )
}

function BotaoConfirmar() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="h-10">
      <Check className="size-4" />
      {pending ? "Verificando..." : "Confirmar e ativar"}
    </Button>
  )
}

function BotaoDesativar() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="destructive" disabled={pending} className="h-10">
      {pending ? "Desativando..." : "Desativar"}
    </Button>
  )
}

function Erro({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
      {children}
    </p>
  )
}
