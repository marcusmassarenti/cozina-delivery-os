"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"

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
import { deleteUnit } from "../_actions"

export function DeleteUnitButton({
  unitId,
  unitName,
}: {
  unitId: string
  unitName: string
}) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const router = useRouter()

  const onConfirm = async () => {
    setBusy(true)
    setErr(null)
    const res = await deleteUnit(unitId)
    setBusy(false)
    if (res.ok) {
      setOpen(false)
      router.refresh()
    } else {
      setErr(res.message ?? "Erro ao deletar")
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <button
            type="button"
            aria-label="Deletar unidade"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
            onClick={(e) => e.stopPropagation()}
          >
            <Trash2 className="size-3.5" />
          </button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deletar unidade</AlertDialogTitle>
          <AlertDialogDescription>
            Você está prestes a deletar <strong>{unitName}</strong>. Essa ação
            não pode ser desfeita. Pedidos históricos e dados ligados a essa
            unidade também serão removidos.
          </AlertDialogDescription>
        </AlertDialogHeader>
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
            className="bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-600"
          >
            {busy ? "Deletando..." : "Sim, deletar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
