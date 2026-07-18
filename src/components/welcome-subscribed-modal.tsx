"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { PartyPopper, ArrowRight } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

/**
 * "Obrigado / bem-vindo" logo depois de assinar. Aparece quando a URL tem
 * ?assinou=1 (o checkout — simulado ou real — redireciona pra cá). Lê o
 * parâmetro via useSyncExternalStore pra não dar mismatch de hidratação.
 */
export function WelcomeSubscribedModal({ userName }: { userName: string }) {
  const router = useRouter()
  const [dismissed, setDismissed] = React.useState(false)
  const flag = React.useSyncExternalStore(
    () => () => {},
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("assinou") === "1",
    () => false,
  )
  const open = flag && !dismissed

  const primeiroNome = userName.split(" ")[0] || userName

  function fechar() {
    setDismissed(true)
    // Tira o ?assinou=1 da URL (sem recarregar).
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href)
      url.searchParams.delete("assinou")
      router.replace(url.pathname + url.search)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <PartyPopper className="size-7" />
          </div>
          <DialogTitle className="mt-3 text-2xl">
            Bem-vindo, {primeiroNome}! 🎉
          </DialogTitle>
          <DialogDescription className="text-[15px] leading-relaxed">
            Sua assinatura está ativa — obrigado por embarcar no Delivery OS.
            Agora é ver o lucro real de cada loja, sem planilha e sem susto.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={fechar} className="w-full gap-1.5">
            Começar
            <ArrowRight className="size-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
