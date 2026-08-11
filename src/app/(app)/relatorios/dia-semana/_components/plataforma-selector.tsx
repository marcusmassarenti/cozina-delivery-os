"use client"

import { useRouter, useSearchParams } from "next/navigation"

import { PlatformLogo } from "@/components/platform-logo"

const OPCOES = [
  { id: "ifood", label: "iFood" },
  { id: "cardapioweb", label: "Cardápio Web" },
  { id: "99food", label: "99 Food" },
  { id: "keeta", label: "Keeta" },
] as const

/**
 * Filtro de plataforma do relatório de dia da semana.
 *
 * Pílulas em vez de select: são quatro opções fixas e o logo ajuda a bater o
 * olho. Navega por querystring pra o link ser copiável e o PDF sair do que
 * está na tela — mesmo padrão do seletor de loja.
 *
 * ⚠️ 99 Food e Keeta não guardam o preço do pedido. Selecionadas sozinhas, o
 * relatório passa a medir por PEDIDOS — a tela avisa, em vez de mostrar tudo
 * zerado.
 */
export function PlataformaSelector({ atual }: { atual: string | null }) {
  const router = useRouter()
  const params = useSearchParams()

  const ir = (id: string | null) => {
    const q = new URLSearchParams(params.toString())
    if (id) q.set("plataforma", id)
    else q.delete("plataforma")
    router.push(`/relatorios/dia-semana${q.toString() ? `?${q}` : ""}`)
  }

  const pill = (ativo: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
      ativo
        ? "bg-foreground text-background"
        : "border bg-card hover:bg-muted"
    }`

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={() => ir(null)} className={pill(!atual)}>
        Todas
      </button>
      {OPCOES.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => ir(o.id)}
          className={pill(atual === o.id)}
        >
          <PlatformLogo platform={o.id} className="size-3.5 rounded-[3px]" />
          {o.label}
        </button>
      ))}
    </div>
  )
}
