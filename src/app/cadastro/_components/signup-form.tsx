"use client"

import * as React from "react"
import { useActionState } from "react"
import { useSearchParams } from "next/navigation"
import { useFormStatus } from "react-dom"
import Link from "next/link"
import {
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MessageCircle,
  Ticket,
  User,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { signUp, type SignUpState } from "../_actions"

const initial: SignUpState = { ok: false }

export function SignupForm() {
  // Sucesso do cadastro redireciona pra /cadastro/confirme — aqui só tratamos
  // o form e os erros.
  const [state, formAction] = useActionState(signUp, initial)

  // Cupom vem de duas formas: link de indicação (?ref=DIEGO) ou digitado.
  // Vindo do link o campo já nasce preenchido e aberto — quem clicou no link
  // do parceiro não deveria precisar procurar onde colar o código.
  const ref = useSearchParams().get("ref") ?? ""
  const [mostrarCupom, setMostrarCupom] = React.useState(Boolean(ref))

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field
        id="nome"
        name="nome"
        label="Seu nome"
        type="text"
        placeholder="João da Silva"
        autoComplete="name"
        icon={<User className="size-4" />}
      />
      <Field
        id="empresa"
        name="empresa"
        label="Nome da sua empresa"
        type="text"
        placeholder="Ex.: Burger House"
        autoComplete="organization"
        icon={<Building2 className="size-4" />}
      />
      <Field
        id="email"
        name="email"
        label="E-mail"
        type="email"
        placeholder="seu@email.com"
        autoComplete="email"
        icon={<Mail className="size-4" />}
      />
      <Field
        id="whatsapp"
        name="whatsapp"
        label="WhatsApp (opcional)"
        type="tel"
        placeholder="(11) 90000-0000"
        autoComplete="tel"
        required={false}
        icon={<MessageCircle className="size-4" />}
      />
      <Field
        id="senha"
        name="senha"
        label="Senha"
        type="password"
        placeholder="mínimo 6 caracteres"
        autoComplete="new-password"
        icon={<Lock className="size-4" />}
        revealable
      />

      {mostrarCupom ? (
        <Field
          id="cupom"
          name="cupom"
          label="Cupom de indicação"
          placeholder="ex.: DIEGO10"
          required={false}
          defaultValue={ref}
          icon={<Ticket className="size-4" />}
        />
      ) : (
        <button
          type="button"
          onClick={() => setMostrarCupom(true)}
          className="self-start text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Tenho um cupom de indicação
        </button>
      )}

      {state.message && !state.ok && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          {state.message}
        </div>
      )}

      <SubmitButton />

      <p className="text-center text-xs text-muted-foreground">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  )
}

function Field({
  id,
  name,
  label,
  type,
  placeholder,
  autoComplete,
  icon,
  required = true,
  revealable = false,
  defaultValue,
}: {
  id: string
  name: string
  label: string
  /** Opcional: campo de texto simples não precisa declarar. */
  type?: string
  placeholder: string
  autoComplete?: string
  icon: React.ReactNode
  required?: boolean
  defaultValue?: string
  /** Campo de senha: mostra um botão de olho pra revelar o que foi digitado. */
  revealable?: boolean
}) {
  const [show, setShow] = React.useState(false)
  const inputType = revealable ? (show ? "text" : "password") : (type ?? "text")

  return (
    <div className="flex flex-col gap-1.5">
      <Label
        htmlFor={id}
        className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {icon}
        </span>
        <Input
          id={id}
          name={name}
          type={inputType}
          placeholder={placeholder}
          autoComplete={autoComplete ?? "off"}
          defaultValue={defaultValue}
          required={required}
          className={`h-11 pl-9 ${revealable ? "pr-10" : ""}`}
        />
        {revealable && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Ocultar senha" : "Mostrar senha"}
            title={show ? "Ocultar senha" : "Mostrar senha"}
            className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
    </div>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="mt-1 h-11 text-sm font-semibold">
      {pending ? "Criando sua conta..." : "Começar meus 7 dias grátis"}
      {!pending && <ArrowRight className="ml-1 size-4" />}
    </Button>
  )
}
