import Link from "next/link"
import { ArrowRight, Store } from "lucide-react"

/**
 * Aviso no topo do Dashboard (SÓ superadmin) quando há clientes esperando a
 * conexão do iFood — eles clicam "Pedir autorização" no cadastro e a
 * solicitação fica pendente até você enviar no Portal do Desenvolvedor.
 * Sem isto, o pedido ficava invisível (a tela de aprovar não está no menu).
 */
export function IfoodSolicitacoesAviso({
  total,
  primeira,
}: {
  total: number
  primeira: { holding: string; loja: string | null } | null
}) {
  if (total <= 0) return null
  const umaSo = total === 1
  const alvo =
    umaSo && primeira
      ? `${primeira.holding}${primeira.loja ? ` — ${primeira.loja}` : ""}`
      : null

  return (
    <Link
      href="/integracao/ifood-merchants"
      className="flex items-center gap-3 rounded-lg border border-[#EA1D2C]/30 bg-[#EA1D2C]/[0.06] px-3 py-2.5 text-sm transition-colors hover:bg-[#EA1D2C]/10"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#EA1D2C]/12 text-[#EA1D2C]">
        <Store className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">
          {umaSo
            ? "1 loja pediu conexão com o iFood"
            : `${total} lojas pediram conexão com o iFood`}
        </p>
        <p className="text-xs text-muted-foreground">
          {alvo
            ? `${alvo} — aguardando você solicitar no Portal do Desenvolvedor.`
            : "Aguardando você solicitar no Portal do Desenvolvedor (por CNPJ)."}
        </p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#EA1D2C]">
        Revisar
        <ArrowRight className="size-3.5" />
      </span>
    </Link>
  )
}
