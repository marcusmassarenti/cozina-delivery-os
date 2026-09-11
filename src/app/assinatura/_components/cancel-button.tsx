"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { XCircle } from "lucide-react"

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
import { cancelarAssinatura } from "../_actions"

/**
 * O que o cancelamento significa muda com o que o cliente tem — e a caixa de
 * confirmação precisa dizer isso ANTES do clique:
 *
 *  - assinatura: para a cobrança recorrente; acesso até o fim do período pago
 *  - renovacao12x: o 12x já foi pago; cancela só a renovação, e as parcelas
 *    seguem no cartão (é o que o Termo de Adesão diz)
 *  - pendente: nada foi pago; a cobrança em aberto é removida
 */
type Modo = "assinatura" | "renovacao12x" | "pendente"

const TEXTO: Record<
  Modo,
  { gatilho: string; titulo: string; botao: string }
> = {
  assinatura: {
    gatilho: "Cancelar assinatura",
    titulo: "Cancelar assinatura?",
    botao: "Cancelar assinatura",
  },
  renovacao12x: {
    gatilho: "Cancelar renovação",
    titulo: "Cancelar a renovação?",
    botao: "Cancelar renovação",
  },
  pendente: {
    gatilho: "Desistir desta assinatura",
    titulo: "Desistir do pagamento?",
    botao: "Desistir",
  },
}

export function CancelButton({
  fimPeriodo,
  modo = "assinatura",
}: {
  fimPeriodo: string | null
  modo?: Modo
}) {
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const router = useRouter()
  const t = TEXTO[modo]
  const fim = fimPeriodo
    ? fimPeriodo.split("-").reverse().join("/")
    : "o fim do período pago"

  async function onConfirm() {
    setPending(true)
    setError(null)
    const res = await cancelarAssinatura()
    setPending(false)
    if (res.ok) {
      setOpen(false)
      router.refresh()
    } else {
      setError(res.message ?? "Erro ao cancelar.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <XCircle className="size-3.5" />
            {t.gatilho}
          </button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.titulo}</DialogTitle>
          <DialogDescription>
            {modo === "renovacao12x" ? (
              <>
                Seu plano anual segue ativo até <strong>{fim}</strong>. As
                parcelas já contratadas continuam no cartão até a última — o
                banco aprovou a compra inteira. Depois dessa data, o plano não
                renova.
              </>
            ) : modo === "pendente" ? (
              <>
                A cobrança que ainda não foi paga é removida. Você pode assinar
                de novo quando quiser, em qualquer ciclo.
              </>
            ) : (
              <>
                A cobrança recorrente para de rodar. Seu acesso continua até{" "}
                <strong>{fim}</strong>. Depois disso, o acesso é suspenso até
                você assinar de novo.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Voltar
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? "Cancelando..." : t.botao}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
