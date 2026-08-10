import { Star } from "lucide-react"

/**
 * Selo Super Restaurante, no formato do próprio iFood (pílula âmbar).
 *
 * Três estados, e a diferença entre eles importa:
 *  • Nível 5  → é Super. Dourado, como no app.
 *  • Nível 1-4 → elegível e subindo. Cinza, com o número — mostrar "não é
 *    Super" seria verdade mas inútil; o número diz o quanto falta.
 *  • Não elegível → a loja nem entra no programa (volume abaixo do mínimo).
 *
 * Loja SEM relatório importado não renderiza nada — quem chama passa `null`.
 * Um selo cinza em loja sem dado afirmaria que ela não é Super, e não sabemos.
 */
export function SuperBadge({
  nivel,
  eSuper,
  eElegivel,
  tamanho = "md",
  titulo,
}: {
  nivel: number | null
  eSuper: boolean
  eElegivel: boolean
  tamanho?: "sm" | "md"
  /** Texto do tooltip — normalmente o período a que o selo se refere. */
  titulo?: string
}) {
  const sm = tamanho === "sm"
  const base = `inline-flex items-center gap-1 rounded-full font-bold ${
    sm ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
  }`
  const estrela = sm ? "size-3" : "size-3.5"

  if (eSuper) {
    return (
      <span
        title={titulo}
        className={`${base} bg-amber-400 text-amber-950 dark:bg-amber-500 dark:text-amber-950`}
      >
        <Star className={`${estrela} fill-current`} />
        Super{nivel ? ` · Nível ${nivel}` : ""}
      </span>
    )
  }

  if (!eElegivel) {
    return (
      <span
        title={titulo ?? "Ainda não entra no programa Super"}
        className={`${base} bg-muted text-muted-foreground`}
      >
        Não elegível
      </span>
    )
  }

  return (
    <span
      title={titulo}
      className={`${base} border border-amber-300/60 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-300`}
    >
      <Star className={estrela} />
      Nível {nivel ?? "—"}
    </span>
  )
}
