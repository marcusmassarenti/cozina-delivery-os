"use client"

import * as React from "react"
import Link from "next/link"
import { ExternalLink, Loader2 } from "lucide-react"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { ClientDetail } from "@/lib/data/plataforma"

import { fetchClientDetail } from "../_actions"
import { ClientDetailView } from "./client-detail-view"

/**
 * Drawer lateral que abre o detalhe do cliente NA MESMA TELA (sem navegar).
 * Busca o detalhe sob demanda ao abrir. `openId` controla qual cliente.
 */
export function ClientDetailDrawer({
  openId,
  fallbackName,
  onClose,
}: {
  openId: string | null
  /** Nome já conhecido da linha — mostra no título enquanto carrega. */
  fallbackName?: string | null
  onClose: () => void
}) {
  // Guarda { id, detail } pra saber se o que temos é do cliente aberto agora.
  const [loaded, setLoaded] = React.useState<{
    id: string
    detail: ClientDetail | null
  } | null>(null)

  React.useEffect(() => {
    if (!openId) return
    let cancel = false
    fetchClientDetail(openId).then((d) => {
      if (!cancel) setLoaded({ id: openId, detail: d })
    })
    return () => {
      cancel = true
    }
  }, [openId])

  // Re-busca o detalhe depois de uma mudança feita dentro do drawer (ex.:
  // definir plano / liberar cortesia). O router.refresh() só atualiza a
  // página de trás; o conteúdo do drawer é buscado à parte, então precisa
  // recarregar na mão pra refletir na hora.
  const reload = React.useCallback(() => {
    if (!openId) return
    fetchClientDetail(openId).then((d) => setLoaded({ id: openId, detail: d }))
  }, [openId])

  const detail = loaded?.id === openId ? loaded.detail : null
  const loading = openId != null && loaded?.id !== openId

  return (
    <Sheet open={!!openId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 !max-w-3xl"
      >
        <SheetHeader className="border-b">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-lg">
              {detail?.name ?? fallbackName ?? "Cliente"}
            </SheetTitle>
            {openId && (
              <Link
                href={`/plataforma/${openId}`}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                title="Abrir em página cheia"
              >
                <ExternalLink className="size-3" />
                página cheia
              </Link>
            )}
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 p-5">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Carregando…
            </div>
          )}
          {!loading && !detail && (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Não foi possível carregar o cliente.
            </p>
          )}
          {detail && (
            <ClientDetailView detail={detail} embedded onChanged={reload} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
