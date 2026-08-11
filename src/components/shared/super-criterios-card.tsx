import { AlertTriangle, Check, X } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { fmtNum, fmtPct } from "@/lib/format"
import type { CriterioSuper, SuperCriterios } from "@/lib/data/super"
import { SuperBadge } from "./super-badge"

/**
 * "Caminho para o Super": os 5 critérios do programa, com valor atual e meta.
 *
 * Reproduz a tela do iFood, com duas diferenças que são o motivo de existir:
 * mostra os CINCO critérios de uma vez (lá são três cards e o resto está em
 * outro lugar), e destaca quem está DENTRO mas por pouco.
 *
 * O "por pouco" é o ponto. Quem já falhou não tem mais o que fazer neste
 * ciclo; quem está na borda ainda tem. No primeiro arquivo lido (10/08/26),
 * São José dos Campos estava a 0,99% de cancelamento e Jardins a 0,97%, com
 * limite de 1% — duas lojas a um centésimo de perder o Nível 5, e isso não
 * aparecia em lugar nenhum do sistema.
 */
export function SuperCriteriosCard({ dados }: { dados: SuperCriterios }) {
  const { criterios, faltando, emRisco, diasAteRecalculo } = dados

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        {/* Logo do iFood na frente: o Super é programa DELES, e a tela mistura
            plataformas. Sem a marca, o card parece critério nosso. */}
        <PlatformLogo platform="ifood" className="size-4 rounded-[4px]" />
        <h3 className="text-sm font-semibold">Caminho para o Super</h3>
        <SuperBadge
          nivel={dados.nivel}
          eSuper={dados.eSuper}
          eElegivel={dados.eElegivel}
          titulo={dados.periodoOficial ?? undefined}
        />
        <span className="ml-auto text-[11px] text-muted-foreground">
          {diasAteRecalculo === 0
            ? "recalcula hoje"
            : `recalcula em ${diasAteRecalculo} ${diasAteRecalculo === 1 ? "dia" : "dias"}`}
        </span>
      </div>

      <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
        {dados.parcialAte ? (
          <>
            Números <strong>parciais</strong>, do fechamento parcial do iFood.
            O selo acima é o que está valendo
            {dados.periodoOficial ? ` (${dados.periodoOficial})` : ""}.
          </>
        ) : (
          <>Números do último relatório Super importado.</>
        )}{" "}
        O iFood recongela o selo todo dia 10, sobre os últimos 3 meses.
      </p>

      <div className="space-y-1.5">
        {criterios.map((c) => (
          <Linha key={c.chave} c={c} />
        ))}
      </div>

      {emRisco.length > 0 && (
        <p className="mt-3 rounded-lg border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>No limite:</strong>{" "}
          {emRisco.map((c) => c.rotulo.toLowerCase()).join(", ")}. Está dentro
          do critério, mas por pouco — e ainda dá tempo de mexer.
        </p>
      )}

      {faltando.length > 0 && (
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          Falta{faltando.length > 1 ? "m" : ""}{" "}
          <strong>{faltando.map((c) => c.rotulo.toLowerCase()).join(", ")}</strong>{" "}
          para o Nível 5.
        </p>
      )}
    </div>
  )
}

function valorFmt(c: CriterioSuper): string {
  if (c.valor == null) return "—"
  if (c.formato === "pct") return fmtPct(c.valor, 2)
  // Nota sempre com 1 casa: "4,7" é como o iFood escreve, e "5" pareceria
  // outro número.
  if (c.formato === "nota")
    return c.valor.toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })
  return fmtNum(c.valor)
}

function metaFmt(c: CriterioSuper): string {
  if (c.formato === "pct") return `≤ ${fmtPct(c.meta)}`
  if (c.formato === "nota") return `≥ ${c.meta.toLocaleString("pt-BR")}`
  return `≥ ${fmtNum(c.meta)}`
}

function Linha({ c }: { c: CriterioSuper }) {
  const cor = !c.atingido
    ? "text-rose-700 dark:text-rose-400"
    : c.emRisco
      ? "text-amber-700 dark:text-amber-400"
      : "text-emerald-700 dark:text-emerald-400"

  return (
    <div className="flex items-center gap-2 text-xs">
      {!c.atingido ? (
        <X className="size-3.5 shrink-0 text-rose-600" />
      ) : c.emRisco ? (
        <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
      ) : (
        <Check className="size-3.5 shrink-0 text-emerald-600" />
      )}
      <span className="text-muted-foreground">{c.rotulo}</span>
      <span className="ml-auto tabular-nums text-muted-foreground/70">
        {metaFmt(c)}
      </span>
      <span className={`w-16 text-right font-bold tabular-nums ${cor}`}>
        {valorFmt(c)}
      </span>
    </div>
  )
}
