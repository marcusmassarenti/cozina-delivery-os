import Link from "next/link"
import { ArrowRight, Plug } from "lucide-react"

/**
 * Faixa discreta na tela inicial pra quem ainda tem loja fora da API.
 *
 * Deliberadamente sem cor de alarme: não é erro, é oportunidade — e alarme
 * que não some vira ruído, a pessoa aprende a ignorar. O número é o argumento
 * ("9 de 49"), não o adjetivo.
 *
 * Só conta loja SEM pedido em aberto. Quem já pediu vê o outro aviso, o de
 * "falta aprovar no Portal do Parceiro".
 */
export function IfoodConectarAviso({
  faltando,
  totalComIfood,
}: {
  faltando: number
  totalComIfood: number
}) {
  if (faltando === 0) return null

  return (
    <Link
      href="/conectar-ifood"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card px-3 py-2 text-xs transition-colors hover:bg-muted/50"
    >
      <span className="inline-flex items-center gap-1.5 font-medium">
        <Plug className="size-3.5 text-muted-foreground" />
        {faltando} de {totalComIfood}{" "}
        {totalComIfood === 1 ? "loja" : "lojas"} do iFood ainda{" "}
        {faltando === 1 ? "depende" : "dependem"} de planilha
      </span>
      <span className="text-muted-foreground">
        Conectada, a loja traz faturamento, pedidos e avaliações sozinha todo
        dia.
      </span>
      <span className="ml-auto inline-flex items-center gap-1 font-medium text-primary">
        Conectar
        <ArrowRight className="size-3" />
      </span>
    </Link>
  )
}
