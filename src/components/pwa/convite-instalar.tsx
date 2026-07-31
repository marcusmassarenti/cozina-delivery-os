"use client"

import * as React from "react"
import { Share, X, Plus, MoreVertical } from "lucide-react"

const VISTO = "deliveryos_convite_instalar"

type Fase = "oculto" | "ios" | "android"

/**
 * Convite pra instalar o app — só no celular, e só pra quem ainda nao instalou.
 *
 * Existe porque o push depende disso: no iPhone, notificacao web SO funciona
 * com o site adicionado a tela de inicio. Sem este convite, o recurso existe e
 * ninguem chega nele — a pessoa teria que adivinhar o caminho pelo menu de
 * compartilhar do Safari.
 *
 * Os dois sistemas pedem instrucoes DIFERENTES e nao adianta escrever uma so:
 * no Android o proprio Chrome oferece o botao de instalar; no iPhone nao existe
 * botao nenhum, e o caminho e manual pelo menu de compartilhar.
 *
 * Fecha e nao volta (localStorage). Quem dispensou nao quer, e insistir num
 * convite e o jeito mais rapido de virar ruido.
 */
export function ConviteInstalar() {
  const [fase, setFase] = React.useState<Fase>("oculto")
  const promptRef = React.useRef<{ prompt: () => void } | null>(null)

  React.useEffect(() => {
    try {
      if (localStorage.getItem(VISTO)) return
    } catch {
      return
    }

    // Ja instalado? O app roda em "standalone" — nao ha o que convidar.
    const instalado =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true
    if (instalado) return

    const ua = navigator.userAgent
    const iOS = /iphone|ipad|ipod/i.test(ua)
    const celular = iOS || /android/i.test(ua)
    if (!celular) return

    if (iOS) {
      setFase("ios")
      return
    }

    // Android: o Chrome avisa quando PODE instalar. Sem esse evento, o botao
    // nao funcionaria — melhor nao mostrar do que mostrar quebrado.
    const onPrompt = (e: Event) => {
      e.preventDefault()
      promptRef.current = e as unknown as { prompt: () => void }
      setFase("android")
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    return () => window.removeEventListener("beforeinstallprompt", onPrompt)
  }, [])

  function fechar() {
    try {
      localStorage.setItem(VISTO, "1")
    } catch {
      /* navegacao privada: fecha so nesta sessao */
    }
    setFase("oculto")
  }

  if (fase === "oculto") return null

  return (
    <div className="mx-4 mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3.5 text-xs sm:hidden">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            Instale o Delivery OS no seu celular
          </p>
          <p className="mt-0.5 leading-relaxed text-muted-foreground">
            Abre direto pelo icone, sem barra do navegador — e e o que permite
            receber o resumo da sua rede toda manha.
          </p>

          {fase === "ios" ? (
            <ol className="mt-2.5 space-y-1.5 text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <span className="font-semibold text-foreground">1.</span>
                Toque em <Share className="size-3.5 shrink-0" />
                <span className="text-foreground">Compartilhar</span>, na barra
                de baixo
              </li>
              <li className="flex items-center gap-1.5">
                <span className="font-semibold text-foreground">2.</span>
                Escolha <Plus className="size-3.5 shrink-0" />
                <span className="text-foreground">Adicionar a Tela de Inicio</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="font-semibold text-foreground">3.</span>
                Abra pelo icone novo — nao pelo Safari
              </li>
            </ol>
          ) : (
            <>
              <p className="mt-2 flex items-center gap-1.5 text-muted-foreground">
                Ou pelo menu <MoreVertical className="size-3.5" /> do Chrome, em
                <span className="text-foreground">Instalar aplicativo</span>.
              </p>
              <button
                type="button"
                onClick={() => {
                  promptRef.current?.prompt()
                  fechar()
                }}
                className="mt-2.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
              >
                Instalar agora
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={fechar}
          aria-label="Dispensar"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
