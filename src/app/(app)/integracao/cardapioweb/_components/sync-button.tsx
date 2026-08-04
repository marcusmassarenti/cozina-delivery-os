"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { CheckCircle2, RefreshCw, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { fmtNum } from "@/lib/format"

import { rodarSyncAction, type SyncState } from "../_actions"

function Botao({ concluido }: { concluido: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} size="sm">
      <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />
      {/* "Lote" é palavra nossa: quem lê é o lojista, e pra ele o que importa
          é que cada clique traz mais pedidos antigos. */}
      {pending
        ? "Buscando..."
        : concluido
          ? "Buscar pedidos novos"
          : "Buscar mais histórico"}
    </Button>
  )
}

/**
 * Cada clique avança uma fatia do sync. O botão fica visível mesmo depois
 * de concluído porque o incremental (pedidos novos) sempre vale rodar.
 */
export function SyncButton({
  installId,
  concluido,
}: {
  installId: string
  concluido: boolean
}) {
  const [state, action] = useActionState<SyncState, FormData>(rodarSyncAction, {
    ok: false,
  })
  const r = state.resultado

  return (
    <div className="space-y-2">
      <form action={action}>
        <input type="hidden" name="install_id" value={installId} />
        <Botao concluido={concluido} />
      </form>

      {state.message && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlert className="size-3.5 shrink-0" />
          {state.message}
        </p>
      )}

      {r && !state.message && (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
          <p className="flex items-center gap-1.5 font-medium">
            {r.concluido ? (
              <>
                <CheckCircle2 className="size-3.5 text-emerald-600" />
                Sincronização em dia
              </>
            ) : (
              <>
                <RefreshCw className="size-3.5 text-muted-foreground" />
                Lote concluído — ainda falta rodar mais
              </>
            )}
          </p>
          <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
            {r.incremental && (
              <li>
                Novos do período recente:{" "}
                <b className="tabular-nums text-foreground">
                  {fmtNum(r.incremental.pedidos)}
                </b>
              </li>
            )}
            {r.backfill && (
              <li>
                Histórico {r.backfill.de} → {r.backfill.ate}:{" "}
                <b className="tabular-nums text-foreground">
                  {fmtNum(r.backfill.pedidos)}
                </b>{" "}
                cabeçalhos
              </li>
            )}
            {r.detalhe && (
              <li>
                Detalhados agora:{" "}
                <b className="tabular-nums text-foreground">
                  {fmtNum(r.detalhe.processados)}
                </b>
                {r.detalhe.erros > 0 && (
                  <span className="text-amber-700 dark:text-amber-400">
                    {" "}
                    · {fmtNum(r.detalhe.erros)} com erro
                  </span>
                )}
                {" · na fila: "}
                <b className="tabular-nums text-foreground">
                  {fmtNum(r.detalhe.restantes)}
                </b>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
