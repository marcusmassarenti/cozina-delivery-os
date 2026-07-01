"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import Link from "next/link"
import {
  ArrowRight,
  Building2,
  Lock,
  Mail,
  MessageCircle,
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
      />

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
}: {
  id: string
  name: string
  label: string
  type: string
  placeholder: string
  autoComplete: string
  icon: React.ReactNode
  required?: boolean
}) {
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
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className="h-11 pl-9"
        />
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
