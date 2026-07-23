"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Gift, Sparkles, X } from "lucide-react"

/**
 * Pop-up de boas-vindas quando o Nino AI foi liberado "por conta da casa"
 * (cortesia do dono, planos Essencial/Pro). Aparece uma vez por cortesia —
 * o "já vi" é por navegador (localStorage), com a data-fim como chave, então
 * uma nova cortesia reaparece. O botão leva direto pra tela do Nino.
 */
export function NinoCortesiaModal({
  ativa,
  ate,
}: {
  ativa: boolean
  ate: string | null
}) {
  const router = useRouter()
  const [show, setShow] = React.useState(false)

  React.useEffect(() => {
    if (!ativa || !ate) return
    try {
      if (localStorage.getItem("nino_cortesia_vista") === ate) return
    } catch {
      /* localStorage indisponível → mostra mesmo assim */
    }
    setShow(true)
  }, [ativa, ate])

  function fechar() {
    setShow(false)
    try {
      if (ate) localStorage.setItem("nino_cortesia_vista", ate)
    } catch {
      /* ignora */
    }
  }
  function abrirNino() {
    fechar()
    router.push("/consultor-ia")
  }

  if (!show || !ate) return null
  const ateFmt = new Date(ate).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  })

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border bg-card shadow-xl">
        <button
          type="button"
          onClick={fechar}
          aria-label="Fechar"
          className="absolute right-3 top-3 z-10 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>

        {/* Faixa de destaque */}
        <div className="flex flex-col items-center gap-2 bg-gradient-to-b from-emerald-500/15 to-transparent px-6 pt-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-emerald-600 text-white">
            <Gift className="size-6" />
          </span>
          <h2 className="text-lg font-bold tracking-tight">
            O Nino AI é por conta da casa! 🎁
          </h2>
        </div>

        <div className="px-6 pb-6 pt-3 text-center">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Liberamos o <b className="text-foreground">Nino AI</b> pra você
            experimentar até <b className="text-foreground">{ateFmt}</b>, sem
            custo. Ele lê os números das suas lojas e responde na hora — pergunte
            onde está sua taxa, por que cancelam, o que os clientes reclamam, ou
            peça um plano de ação.
          </p>

          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={abrirNino}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Sparkles className="size-4" />
              Experimentar o Nino agora
            </button>
            <button
              type="button"
              onClick={fechar}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Agora não
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
