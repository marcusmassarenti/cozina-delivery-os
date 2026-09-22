import { MessageCircle } from "lucide-react"

/**
 * WhatsApp direto com o Marcus — pra quem está começando.
 *
 * Os clientes que ficaram (DG, Le Brunch, Tech) conectaram as lojas com o
 * Marcus do lado; os dois que entraram sozinhos em set/26 pararam no primeiro
 * dia sem falar com ninguém. Nesta fase, o atalho pra uma pessoa É parte do
 * produto (Marcus, 22/09/26). Mesmo número da tela de Plano.
 */
export const WHATSAPP_MARCUS = "5511995125139"

export function linkWhatsappMarcus(empresa?: string | null): string {
  const texto = empresa
    ? `Oi Marcus! Sou da ${empresa} e quero ajuda pra colocar minhas lojas no Delivery OS.`
    : "Oi Marcus! Quero ajuda pra colocar minhas lojas no Delivery OS."
  return `https://wa.me/${WHATSAPP_MARCUS}?text=${encodeURIComponent(texto)}`
}

export function WhatsappMarcus({
  empresa,
  variante = "cartao",
}: {
  empresa?: string | null
  /** "cartao" = bloco com texto; "linha" = só o botão, pra caber num rodapé. */
  variante?: "cartao" | "linha"
}) {
  const botao = (
    <a
      href={linkWhatsappMarcus(empresa)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
    >
      <MessageCircle className="size-3.5" />
      Falar com o Marcus no WhatsApp
    </a>
  )
  if (variante === "linha") return botao
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#25D366]/40 bg-[#25D366]/[0.06] px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold">Prefere fazer isso com a gente?</p>
        <p className="text-xs text-muted-foreground">
          Fale direto com o Marcus, fundador do Delivery OS — ele te ajuda a
          conectar as suas lojas.
        </p>
      </div>
      {botao}
    </div>
  )
}
