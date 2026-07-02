"use client"

import { Download, ListChecks, Play, Upload } from "lucide-react"

import { type CoachStep } from "@/components/onboarding/coach-tour"
import { TourButton } from "@/components/onboarding/tour-button"

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

/** Botão "Como funciona" + tour da Importação (auto-abre com ?guia=1). */
export function ImportTour() {
  return <TourButton steps={STEPS} autoOpenParam="guia" />
}
