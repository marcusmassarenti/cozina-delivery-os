"use client"

import * as React from "react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { HelpCenter } from "./help-center"

export const OPEN_HELP_EVENT = "deliveryos:open-help"

/**
 * Central de ajuda como MODAL — abre por cima da tela atual (sem navegar).
 * Montado uma vez (na top-bar) e disparado pelo evento OPEN_HELP_EVENT, tanto
 * pelo "?" do topo quanto pelo item "Ajuda" do menu.
 */
export function HelpDialog() {
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(OPEN_HELP_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_HELP_EVENT, onOpen)
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-3xl gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogTitle className="sr-only">Central de ajuda</DialogTitle>
        <div className="max-h-[85vh] overflow-y-auto">
          <HelpCenter compact />
        </div>
      </DialogContent>
    </Dialog>
  )
}
