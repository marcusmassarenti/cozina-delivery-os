import { AlertTriangle } from "lucide-react"

/**
 * Selo "parcial" ao lado de um número cuja leitura não terminou.
 *
 * Pequeno de propósito: o número continua sendo a informação principal (opção
 * A — mostrar com aviso, não esconder). A explicação completa vai numa linha
 * só acima da faixa, pra não repetir a mesma frase em seis cards.
 */
export function MarcaParcial({ aviso }: { aviso: string }) {
  return (
    <span
      title={aviso}
      className="inline-flex shrink-0 cursor-help items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
    >
      <AlertTriangle className="size-2.5" aria-hidden="true" />
      parcial
    </span>
  )
}

/** A linha única de explicação, acima da faixa de números. */
export function AvisoLeituraParcial({ aviso }: { aviso: string }) {
  return (
    <p
      role="status"
      className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
    >
      <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <span>{aviso}</span>
    </p>
  )
}
