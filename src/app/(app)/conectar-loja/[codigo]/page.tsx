import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"

import { getVisibleUnits } from "@/lib/data/units"
import { getPassosConexao } from "@/lib/data/onboarding-conexao"

import { EsteiraConexao } from "./_components/esteira-conexao"

export const dynamic = "force-dynamic"

/**
 * A esteira de conexão de uma loja.
 *
 * Existe porque salvar a unidade era o FIM do fluxo: o cliente escolhia as
 * plataformas, salvava, a tela fechava — e conectar virava uma tarefa solta
 * que ninguém agenda. Este é o único momento em que ele ainda está com a
 * intenção na mão (Marcus, 18/08/26).
 */
export default async function ConectarLojaPage({
  params,
}: {
  params: Promise<{ codigo: string }>
}) {
  const { codigo } = await params
  const units = await getVisibleUnits()
  const loja = units.find((u) => u.code === decodeURIComponent(codigo))
  if (!loja) notFound()

  const passos = await getPassosConexao(loja.id)

  return (
    <div className="flex flex-1 flex-col gap-4 bg-muted/30 p-6">
      <div>
        <Link
          href="/unidades"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          Unidades
        </Link>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
          Conectar {loja.code} · {loja.name}
        </h1>
        <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
          Cada plataforma se conecta de um jeito. Faça na ordem que quiser — e
          se preferir deixar alguma pra depois, é só pular: ela continua
          esperando aqui.
        </p>
      </div>

      <EsteiraConexao
        unitId={loja.id}
        lojaCode={loja.code}
        passos={passos}
        temCnpj={!!(loja.cnpj ?? "").replace(/\D/g, "").match(/^\d{14}$/)}
      />
    </div>
  )
}
