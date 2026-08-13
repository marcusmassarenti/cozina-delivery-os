import { KeyRound, MailCheck } from "lucide-react"

import { DeliveryOsMark } from "@/components/delivery-os-logo"
import { ConfirmButton } from "./_components/confirm-button"

export const metadata = {
  title: "Confirmar — Delivery OS",
}

/**
 * Uma tela pros quatro e-mails de autenticação. O que muda é só o texto — a
 * mecânica (clicar → verifyOtp no servidor) é a mesma, e é ela que faz o link
 * funcionar; ver `@/lib/auth/link-email`.
 */
const COPY = {
  recovery: {
    titulo: "Redefinir sua senha",
    texto: "Clique no botão abaixo pra criar uma senha nova.",
    botao: "Criar nova senha",
    chave: true,
  },
  invite: {
    titulo: "Seu acesso ao Delivery OS",
    texto: "Clique no botão abaixo pra definir sua senha e entrar.",
    botao: "Definir minha senha",
    chave: true,
  },
  magiclink: {
    titulo: "Entrar no Delivery OS",
    texto: "Clique no botão abaixo pra entrar na sua conta.",
    botao: "Entrar na minha conta",
    chave: false,
  },
  signup: {
    titulo: "Confirmar seu e-mail",
    texto: "Clique no botão abaixo pra ativar sua conta e começar seus 7 dias grátis.",
    botao: "Confirmar meu e-mail",
    chave: false,
  },
} as const

export default async function AuthConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>
}) {
  const sp = await searchParams
  const tokenHash = sp.token_hash ?? ""
  const type = sp.type ?? "signup"
  const c = COPY[type as keyof typeof COPY] ?? COPY.signup
  const Icone = c.chave ? KeyRound : MailCheck

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex items-center justify-center gap-2">
          <DeliveryOsMark className="size-8" />
          <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Delivery OS
          </span>
        </div>

        <div className="mx-auto mt-6 flex size-14 items-center justify-center rounded-2xl bg-orange-100 text-[#ff4d1c] dark:bg-orange-950/30">
          <Icone className="size-7" />
        </div>

        <h1 className="mt-4 text-xl font-semibold">{c.titulo}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{c.texto}</p>

        {tokenHash ? (
          <ConfirmButton
            tokenHash={tokenHash}
            type={type}
            next={sp.next ?? "/inicio"}
            rotulo={c.botao}
          />
        ) : (
          <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
            Link incompleto. Abra o link direto do e-mail.
          </p>
        )}
      </div>
    </div>
  )
}
