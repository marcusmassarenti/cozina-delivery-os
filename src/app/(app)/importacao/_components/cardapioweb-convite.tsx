import Link from "next/link"
import { Plug } from "lucide-react"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"

/**
 * Convite pra conectar o Cardápio Web — pra quem DECLAROU usar e não conectou.
 *
 * Medido em 03/ago/26: quatro lojas de clientes reais marcaram Cardápio Web no
 * cadastro e NENHUMA tinha conexão. Não era falha técnica (o fluxo inteiro foi
 * testado ponta a ponta e funciona) — é que a tela de integração não aparece em
 * lugar nenhum do caminho normal do lojista. Mesmo padrão do push, que ficou com
 * um assinante até a faixa de convite entrar no dashboard.
 *
 * Enquanto isso o faturamento dessas lojas fica fora do sistema, e nem o cliente
 * nem nós percebemos: o número aparece menor e parece certo.
 *
 * Só aparece quando há o que fazer — declarou, não conectou. Some sozinha
 * assim que a primeira loja conecta.
 */
export async function CardapiowebConvite() {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return null

  const admin = createAdminClient()
  const [{ data: declaradas }, { count: conectadas }] = await Promise.all([
    admin
      .from("unit_platforms")
      .select("unit_id, units!inner(name, brands!inner(holding_id))")
      .eq("platform", "cardapioweb")
      .eq("active", true)
      .eq("units.brands.holding_id", holdingId),
    admin
      .from("cardapioweb_installs")
      .select("id", { count: "exact", head: true })
      .eq("holding_id", holdingId),
  ])

  const qtd = (declaradas ?? []).length
  if (qtd === 0 || (conectadas ?? 0) > 0) return null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-violet-300 bg-violet-50/70 px-4 py-3 dark:border-violet-900/50 dark:bg-violet-950/25">
      <Plug className="size-4 shrink-0 text-violet-600 dark:text-violet-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-violet-900 dark:text-violet-300">
          {qtd === 1
            ? "Sua loja do Cardápio Web ainda não está conectada"
            : `${qtd} lojas do Cardápio Web ainda não estão conectadas`}
        </p>
        <p className="mt-0.5 text-xs text-violet-900/80 dark:text-violet-400/80">
          Você marcou que usa Cardápio Web, mas os pedidos de lá não estão
          entrando — então o faturamento que você vê está menor que o real.
          Conectar leva um minuto e o histórico vem junto.
        </p>
      </div>
      <Link
        href="/integracao/cardapioweb"
        className="shrink-0 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700"
      >
        Conectar agora
      </Link>
    </div>
  )
}
