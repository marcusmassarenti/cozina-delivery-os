import { notFound } from "next/navigation"
import { Headset } from "lucide-react"

import { isSuperadmin } from "@/lib/auth/permissions"

import { listarChamados } from "./_actions"
import { PainelChamados } from "./_components/painel-chamados"

export const metadata = { title: "Suporte — Delivery OS" }

/**
 * Fila de chamados do chat de suporte. Só quem é da plataforma.
 *
 * Existe pra tirar o atendimento do WhatsApp: aqui a conversa vem com o estado
 * da conta do cliente ao lado, então quem responde não precisa perguntar de
 * volta "qual loja?" nem abrir outra tela pra conferir.
 */
export default async function SuportePage() {
  if (!(await isSuperadmin())) notFound()
  const chamados = await listarChamados()

  return (
    <div className="flex flex-1 flex-col gap-4 bg-muted/30 p-6">
      <div>
        <div className="flex items-center gap-2">
          <Headset className="size-5 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">Suporte</h1>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Chamados abertos pelo chat dentro do sistema. A IA atende até 3
          perguntas; o que ela não resolve chega aqui com o diagnóstico pronto.
        </p>
      </div>

      <PainelChamados inicial={chamados} />
    </div>
  )
}
