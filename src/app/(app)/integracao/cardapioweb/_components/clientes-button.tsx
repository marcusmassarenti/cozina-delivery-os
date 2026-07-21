"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { CheckCircle2, TriangleAlert, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { fmtNum } from "@/lib/format"

import {
  sincronizarClientesAction,
  type ClientesState,
} from "../_actions"

function Botao() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} size="sm" variant="outline">
      <Users className={`size-4 ${pending ? "animate-pulse" : ""}`} />
      {pending ? "Buscando clientes..." : "Atualizar clientes"}
    </Button>
  )
}

export function ClientesButton({ installId }: { installId: string }) {
  const [state, action] = useActionState<ClientesState, FormData>(
    sincronizarClientesAction,
    { ok: false },
  )
  const r = state.resultado

  return (
    <div className="space-y-2">
      <form action={action}>
        <input type="hidden" name="install_id" value={installId} />
        <Botao />
      </form>

      {state.message && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlert className="size-3.5 shrink-0" />
          {state.message}
        </p>
      )}

      {r && !state.message && (
        <p className="text-xs text-muted-foreground">
          {r.voltou ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" />
              Varredura completa
            </span>
          ) : (
            <>Continua da página {r.proximaPagina}</>
          )}
          {" · "}
          {fmtNum(r.clientes)} clientes atualizados em {fmtNum(r.paginas)}{" "}
          página{r.paginas === 1 ? "" : "s"}
        </p>
      )}
    </div>
  )
}
