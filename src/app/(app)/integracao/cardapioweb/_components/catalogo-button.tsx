"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { BookOpen, CheckCircle2, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { fmtNum } from "@/lib/format"

import { rodarCatalogoAction, type CatalogoState } from "../_actions"

function Botao() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} size="sm" variant="outline">
      <BookOpen className={`size-4 ${pending ? "animate-pulse" : ""}`} />
      {pending ? "Lendo o cardápio..." : "Atualizar cardápio"}
    </Button>
  )
}

/**
 * Puxa o cardápio da loja. Diferente dos pedidos, aqui não há lote: a API
 * devolve tudo numa chamada, então um clique já traz o cardápio inteiro.
 */
export function CatalogoButton({ installId }: { installId: string }) {
  const [state, action] = useActionState<CatalogoState, FormData>(
    rodarCatalogoAction,
    { ok: false },
  )
  const r = state.resultado

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="install_id" value={installId} />
      <Botao />

      {state.ok && r && (
        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-3.5" />
          {r.itens === 0 ? (
            "cardápio vazio nesta loja"
          ) : (
            <>
              {fmtNum(r.itens)} itens em {fmtNum(r.categorias)} categorias
              {r.comCodigoExterno > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  · {fmtNum(r.comCodigoExterno)} com código do PDV
                </span>
              )}
              {r.removidos > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  · {fmtNum(r.removidos)} saíram do cardápio
                </span>
              )}
            </>
          )}
        </span>
      )}

      {!state.ok && state.message && (
        <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlert className="size-3.5" />
          {state.message}
        </span>
      )}
    </form>
  )
}
