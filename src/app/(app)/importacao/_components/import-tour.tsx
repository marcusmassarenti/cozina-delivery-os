"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Download, ListChecks, Play, Upload } from "lucide-react"

import { CoachTour, type CoachStep } from "@/components/onboarding/coach-tour"

const STEPS: CoachStep[] = [
  {
    selector: '[data-tour="download"]',
    icon: <Download className="size-4" />,
    title: "Baixe os relatórios",
    body: "Aqui você pega os relatórios das plataformas. Comece pelo iFood — baixe Cardápio, Financeiro e Avaliações.",
  },
  {
    selector: '[data-tour="dropzone"]',
    icon: <Upload className="size-4" />,
    title: "Suba os arquivos",
    body: "Arraste os XLSX aqui (ou clica pra escolher). O sistema detecta sozinho a plataforma e a loja de cada arquivo.",
  },
  {
    selector: '[data-tour="import-btn"]',
    icon: <Play className="size-4" />,
    title: "Importar",
    body: 'Clica pra processar. Se aparecer "loja desconhecida", é só vincular à sua unidade ali na hora.',
  },
  {
    selector: '[data-tour="checklist"]',
    icon: <ListChecks className="size-4" />,
    title: "Acompanhe o que falta",
    body: "Aqui você vê, por plataforma, o que já entrou e o que ainda falta importar no mês.",
  },
]

/** Dispara o tour guiado quando a URL tem ?guia=1 (vindo dos Primeiros passos). */
export function ImportTour() {
  const params = useSearchParams()
  const router = useRouter()
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    if (params.get("guia") === "1") {
      // Pequeno atraso pra a página montar antes de medir os elementos.
      const t = setTimeout(() => setOpen(true), 400)
      return () => clearTimeout(t)
    }
  }, [params])

  function close() {
    setOpen(false)
    // Tira o ?guia da URL pra não reabrir no refresh.
    router.replace("/importacao")
  }

  return <CoachTour steps={STEPS} open={open} onClose={close} />
}
