"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ShieldOff } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { resetUserMfa } from "../_actions"

/**
 * Desliga a verificação em duas etapas de um usuário — a saída para quem
 * perdeu o celular. Só aparece para quem realmente tem 2FA ativo.
 */
export function ResetMfaButton({
  userId,
  userName,
  userEmail,
}: {
  userId: string
  userName: string | null
  userEmail: string
}) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const router = useRouter()

  const onConfirm = async () => {
    setBusy(true)
    setErr(null)
    const res = await resetUserMfa(userId)
    setBusy(false)
    if (res.ok) {
      setOpen(false)
      router.refresh()
    } else {
      setErr(res.message ?? "Erro ao desativar")
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <button
            type="button"
            aria-label="Desativar verificação em duas etapas"
            title="Perdeu o celular? Desative o 2FA desta pessoa"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/30"
          >
            <ShieldOff className="size-3.5" />
          </button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desativar verificação em duas etapas</AlertDialogTitle>
          <AlertDialogDescription>
            Isso remove o aplicativo autenticador de{" "}
            <strong>{userName ?? userEmail}</strong>. Na próxima vez, essa
            pessoa entrará <strong>só com e-mail e senha</strong> — e poderá
            cadastrar um novo aparelho depois.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
          <b>Confirme quem está pedindo.</b> Este é o caminho que um golpista
          usaria para derrubar a proteção da conta. Só faça isso após falar com
          a pessoa por um canal que você reconhece.
        </div>

        {err && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
            {err}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
            disabled={busy}
            className="bg-amber-600 text-white hover:bg-amber-700 focus:ring-amber-600"
          >
            {busy ? "Desativando..." : "Sim, desativar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
