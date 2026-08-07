"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Check, Copy, CreditCard, X } from "lucide-react"

import { convidarParaAsaas, type ConviteAsaasState } from "../_actions"
import { fmtBRL } from "@/lib/format"

/**
 * Convida um cliente que paga na mão a migrar pro cartão recorrente.
 *
 * Existe porque /assinatura manda quem está "paid" pra tela de gestão: o
 * cliente marcado como pago à mão fica sem caminho até o Asaas, e é ele quem
 * mais interessa migrar — hoje a cobrança depende de alguém lembrar do Pix
 * todo mês.
 *
 * O convite não cria a cobrança: o Asaas exige CPF/CNPJ e nenhum cliente tem
 * esse campo. Quem informa é o próprio cliente no checkout — documento fiscal
 * digitado por terceiro vira nota fiscal errada depois.
 */
export function ConviteAsaasButton({
  holdingId,
  clienteNome,
  convidadoEm,
  jaTemAssinatura,
  valorMensal,
  vencimento,
}: {
  holdingId: string
  clienteNome: string
  convidadoEm: string | null
  /** Pra mensagem citar o valor real em vez de mandar o cliente adivinhar. */
  valorMensal?: number | null
  vencimento?: string | null
  jaTemAssinatura: boolean
}) {
  const [state, action] = useActionState<ConviteAsaasState, FormData>(
    convidarParaAsaas,
    { ok: false },
  )
  const [copiado, setCopiado] = React.useState(false)

  if (jaTemAssinatura) {
    return (
      <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
        Já paga por assinatura recorrente no Asaas.
      </p>
    )
  }

  const ativo = Boolean(convidadoEm) || Boolean(state.link)
  const link = state.link ?? "https://www.deliveryos.food/assinatura"

  // A mensagem NÃO fala em "migrar" nem em substituir Pix/boleto: pra quase
  // todo cliente daqui este é o PRIMEIRO pagamento, e dizer "não precisa mais
  // lembrar do Pix" pra quem nunca pagou Pix nenhum entrega que o texto é
  // padrão — logo no momento em que se está pedindo dinheiro pela 1ª vez.
  const valor = valorMensal && valorMensal > 0 ? fmtBRL(valorMensal) : null
  const venc = vencimento ? vencimento.split("-").reverse().join("/") : null
  const msg = [
    `Oi! Liberei a assinatura do ${clienteNome} no DeliveryOS.`,
    `É só entrar em ${link}, escolher o plano e cadastrar o cartão`,
    valor
      ? `— a mensalidade de ${valor} passa a ser cobrada automático todo mês.`
      : "— a mensalidade passa a ser cobrada automático todo mês.",
    venc ? `O primeiro vencimento é ${venc}.` : "",
    "Qualquer dúvida é só me chamar.",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div className="space-y-2">
      {!ativo ? (
        <form action={action} className="space-y-1.5">
          <input type="hidden" name="holdingId" value={holdingId} />
          {/* Cupom opcional no convite: o desconto já chega aplicado quando o
              cliente abre /assinatura, em vez de depender de ele digitar o
              código certo. Negociação fechada no WhatsApp não pode depender de
              o cliente lembrar de um código. */}
          <input
            name="cupom"
            placeholder="Cupom (opcional) — ex.: DGFOODS"
            autoCapitalize="characters"
            className="w-full rounded-md border bg-background px-2 py-1.5 text-[11px] placeholder:text-muted-foreground/70"
          />
          <SubmitConvite />
          {state.error && (
            <p className="text-[11px] text-rose-600">{state.error}</p>
          )}
        </form>
      ) : (
        <div className="rounded-lg border border-sky-300 bg-sky-50/60 p-2.5 dark:border-sky-900/50 dark:bg-sky-950/25">
          <p className="text-[11px] font-medium text-sky-800 dark:text-sky-300">
            Convite liberado — o cliente já consegue assinar em /assinatura.
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(msg)
                setCopiado(true)
                setTimeout(() => setCopiado(false), 1500)
              }}
              className="inline-flex items-center gap-1 rounded border bg-background px-2 py-1 text-[11px] font-medium transition-colors hover:bg-muted"
            >
              {copiado ? (
                <Check className="size-3" />
              ) : (
                <Copy className="size-3" />
              )}
              {copiado ? "Copiado!" : "Copiar mensagem pro WhatsApp"}
            </button>
            <form action={action} className="inline">
              <input type="hidden" name="holdingId" value={holdingId} />
              <input type="hidden" name="remover" value="1" />
              <SubmitRemover />
            </form>
          </div>
        </div>
      )}
      {state.error && (
        <p className="text-[11px] text-rose-600">{state.error}</p>
      )}
    </div>
  )
}

function SubmitConvite() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:bg-muted disabled:opacity-60"
    >
      <CreditCard className="size-3.5" />
      {pending ? "Liberando..." : "Convidar a pagar no Asaas"}
    </button>
  )
}

function SubmitRemover() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      title="Retira o convite — o cliente volta a não conseguir assinar sozinho"
      className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted"
    >
      <X className="size-3" />
      {pending ? "..." : "Retirar"}
    </button>
  )
}
