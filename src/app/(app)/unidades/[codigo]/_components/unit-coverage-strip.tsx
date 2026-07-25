import Link from "next/link"
import { AlertTriangle, CircleCheck, Download, Info } from "lucide-react"

import { PlatformLogo, type MarketplaceId } from "@/components/platform-logo"
import type {
  ImportCoverage,
  PlatformCoverage,
} from "@/lib/data/relatorio-diario"

const MES_ABREV = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
]
const PLAT_LABEL: Record<MarketplaceId, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
}

/**
 * Faixa de cobertura de importação DESTA loja no mês — até que dia cada
 * plataforma tem dado, e o que falta. Pra o usuário sempre saber até quando
 * vai a informação da tela e o que precisa subir. (Só as plataformas ativas
 * da loja são mostradas.)
 */
export function UnitCoverageStrip({
  coverage,
  month,
  periodLabel,
  platforms,
  mesEmAberto = false,
}: {
  coverage: ImportCoverage
  month: number
  periodLabel: string
  /** Plataformas ativas da loja — só essas entram na cobertura. */
  platforms: MarketplaceId[]
  /** Período exibido = mês corrente → chip "mês em aberto" explicando por
   *  que o portal (ao vivo) pode mostrar um pouco mais que o sistema. */
  mesEmAberto?: boolean
}) {
  const covOf: Record<MarketplaceId, PlatformCoverage> = {
    ifood: coverage.ifood,
    "99food": coverage.ninefood,
    keeta: coverage.keeta,
  }
  const ativos = (["ifood", "99food", "keeta"] as MarketplaceId[]).filter((id) =>
    platforms.includes(id),
  )
  if (ativos.length === 0) return null

  const faltantes = ativos.filter((id) => covOf[id].lastDay == null)
  const todosSemDados = faltantes.length === ativos.length
  const tone = todosSemDados
    ? "border-rose-200 bg-rose-50/60 dark:border-rose-900/40 dark:bg-rose-950/20"
    : faltantes.length > 0
      ? "border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20"
      : "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20"

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2 text-[11px] ${tone}`}
    >
      <span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground">
        {faltantes.length > 0 ? (
          <AlertTriangle className="size-3.5 text-amber-600" />
        ) : (
          <CircleCheck className="size-3.5 text-emerald-600" />
        )}
        Dados importados · {periodLabel}
      </span>

      <div className="flex flex-wrap items-center gap-1.5">
        {ativos.map((id) => {
          const cov = covOf[id]
          const semDados = cov.lastDay == null
          return (
            <span
              key={id}
              className={`inline-flex items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 font-medium ${
                semDados
                  ? "border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-400"
                  : "border-border text-foreground"
              }`}
            >
              <PlatformLogo platform={id} size="sm" />
              {semDados
                ? "sem dados"
                : `até ${String(cov.lastDay).padStart(2, "0")}/${MES_ABREV[month - 1]}`}
            </span>
          )
        })}
      </div>

      {/* Mês corrente: explica a diferença vs o portal (ao vivo) no hover —
          é aqui que a pessoa está quando compara as duas telas. */}
      {mesEmAberto && (
        <span
          title={
            "Comparando com o portal? O portal do iFood mostra as vendas AO VIVO; aqui entra a conciliação financeira, que fecha com algumas horas de defasagem — por isso no mês em aberto o portal pode aparecer um pouco maior. Quando o mês fecha, os números batem ao centavo. Clique em Sincronizar (ou aguarde a sync diária) pra puxar os dias mais recentes."
          }
          className="inline-flex cursor-help items-center gap-1 rounded-full border border-current/25 px-2 py-0.5 font-medium text-muted-foreground"
        >
          <Info className="size-3" />
          mês em aberto
        </span>
      )}

      {faltantes.length > 0 && (
        <Link
          href="/importacao"
          title="Baixe e importe os relatórios faltantes"
          className="inline-flex items-center gap-1 rounded-full border border-current/30 px-2 py-0.5 font-semibold text-muted-foreground transition-colors hover:bg-card/60"
        >
          <Download className="size-3" />
          Falta importar: {faltantes.map((id) => PLAT_LABEL[id]).join(", ")}
        </Link>
      )}
    </div>
  )
}
