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

export function CancelButton({ fimPeriodo }: { fimPeriodo: string | null }) {
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const router = useRouter()

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
            Cancelar assinatura
          </button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar assinatura?</DialogTitle>
          <DialogDescription>
            A cobrança recorrente para de rodar. Seu acesso continua até{" "}
            <strong>
              {fimPeriodo
                ? fimPeriodo.split("-").reverse().join("/")
                : "o fim do período pago"}
            </strong>
            . Depois disso, o acesso é suspenso até você assinar de novo.
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
            {pending ? "Cancelando..." : "Cancelar assinatura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
