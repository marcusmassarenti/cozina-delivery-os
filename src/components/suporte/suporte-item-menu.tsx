"use client"

import * as React from "react"
import { LifeBuoy } from "lucide-react"

import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

import { abrirSuporte, ouvirNova } from "./suporte-canal"

/**
 * "Posso ajudar?" virou item do menu.
 *
 * Fica no RODAPÉ, junto de "Recolher menu", e não na lista de módulos: ajuda
 * não é uma área do sistema que se visita, é uma saída que se procura quando
 * algo emperrou — e o rodapé é onde a pessoa olha por isso.
 *
 * O ponto de resposta nova continua existindo, só mudou de lugar: quem
 * escreveu pro suporte precisa saber que responderam sem ter que abrir.
 */
export function SuporteItemMenu() {
  const [temNova, setTemNova] = React.useState(false)

  React.useEffect(() => ouvirNova(setTemNova), [])

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={abrirSuporte}
        tooltip={temNova ? "Suporte (resposta nova)" : "Falar com o suporte"}
      >
        <span className="relative flex">
          <LifeBuoy />
          {temNova && (
            <span className="absolute -right-1 -top-1 size-2 rounded-full bg-rose-500 ring-2 ring-sidebar" />
          )}
        </span>
        <span>Ajuda</span>
        {temNova && (
          <span className="ml-auto rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold text-white">
            1
          </span>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
