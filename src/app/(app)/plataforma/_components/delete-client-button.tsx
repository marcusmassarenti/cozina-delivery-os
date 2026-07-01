"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"

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
import { deleteClient } from "../_actions"

/**
 * Exclui um cliente (holding) com confirmação. Só aparece quando `canDelete`
 * (a empresa do próprio super-admin não é excluível por aqui).
 */
export function DeleteClientButton({
  id,
  name,
  canDelete,
}: {
  id: string
  name: string
  canDelete: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const router = useRouter()

  if (!canDelete) return null

  async function onConfirm() {
    setPending(true)
    setError(null)
    const res = await deleteClient(id)
    setPending(false)
    if (res.ok) {
      setOpen(false)
      router.refresh()
    } else {
      setError(res.message ?? "Erro ao excluir.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            title="Excluir cliente"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-rose-200 px-2.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/30"
          >
            <Trash2 className="size-3.5" />
            Excluir
          </button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
            <Trash2 className="size-5" />
            Excluir {name}?
          </DialogTitle>
          <DialogDescription>
            Isso apaga a empresa, <strong>todas as lojas</strong>, os dados
            importados e os <strong>usuários</strong> dela. Não dá pra desfazer.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Excluindo..." : "Excluir cliente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
