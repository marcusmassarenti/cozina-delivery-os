"use client"

import * as React from "react"
import {
  Sparkles,
  RotateCw,
  AlertTriangle,
  ChevronDown,
  Lock,
} from "lucide-react"

import { gerarPlanoIA } from "../_actions"
import type { PlanoIA } from "@/lib/data/diagnostico-ia"

const SEV: Record<string, { label: string; cls: string; dot: string }> = {
  alta: {
    label: "Alta",
    cls: "text-rose-700 dark:text-rose-400",
    dot: "bg-rose-500",
  },
  media: {
    label: "Média",
    cls: "text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  baixa: {
    label: "Baixa",
    cls: "text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
}

export function DiagIA({
  unitId,
  unitName,
  year,
  month,
  inicial,
  podeUsar,
  motivo,
}: {
  unitId: string
  unitName: string
  year: number
  month: number
  inicial: PlanoIA | null
  podeUsar: boolean
  motivo: null | "pro" | "off"
}) {
  const [plano, setPlano] = React.useState<PlanoIA | null>(inicial)
  const [erro, setErro] = React.useState<string | null>(null)
  const [carregando, setCarregando] = React.useState(false)

  async function gerar() {
    setCarregando(true)
    setErro(null)
    const r = await gerarPlanoIA(unitId, unitName, year, month)
    if (r.ok) setPlano(r.plano)
    else setErro(r.message)
    setCarregando(false)
  }

  return (
    <section className="rounded-xl border border-l-4 border-l-primary bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Plano de ação (IA)</h3>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {plano ? "gerado pelo Claude" : "a IA lê a loja e sugere o que fazer"}
        </span>
        {podeUsar && plano && (
          <button
            type="button"
            onClick={gerar}
            disabled={carregando}
            title="Regenera o plano do mês (limite diário pra controlar custo)"
            className="diag-print-hide ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
          >
            <RotateCw className={`size-3.5 ${carregando ? "animate-spin" : ""}`} />
            Regenerar
          </button>
        )}
      </div>

      {erro && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-700 dark:text-rose-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {erro}
        </p>
      )}

      {/* Bloqueado (não é Pro / IA desligada) e sem plano ainda */}
      {!podeUsar && !plano && (
        <div className="mt-2 flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <span>
            {motivo === "pro" ? (
              <>
                O <b className="text-foreground">plano de ação por IA</b> é um
                recurso do plano <b className="text-foreground">Pro</b>.
              </>
            ) : (
              <>
                A IA está desligada. Ligue em{" "}
                <a href="/minha-conta/relatorios" className="underline">
                  Minha conta → Relatórios
                </a>
                .
              </>
            )}
          </span>
        </div>
      )}

      {/* Pode usar, sem plano → botão gerar */}
      {podeUsar && !plano && (
        <div className="mt-2">
          <button
            type="button"
            onClick={gerar}
            disabled={carregando}
            className="diag-print-hide inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-70"
          >
            {carregando ? (
              <>
                <RotateCw className="size-4 animate-spin" />
                Analisando…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Gerar plano com IA
              </>
            )}
          </button>
        </div>
      )}

      {/* Plano (compacto + colapsável) */}
      {plano && (
        <div className="mt-2.5 flex flex-col gap-2">
          {plano.resumo && (
            <p className="rounded-md bg-primary/5 px-3 py-2 text-[13.5px] font-medium leading-snug">
              {plano.resumo}
            </p>
          )}
          {plano.acoes.map((a, i) => {
            const sev = SEV[a.severidade] ?? SEV.media
            return (
              <details
                key={i}
                className="group rounded-lg border bg-muted/20 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2">
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${sev.dot}`}
                  />
                  <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-[13.5px] font-semibold leading-tight">
                    {a.titulo}
                  </span>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide ${sev.cls}`}
                  >
                    {sev.label}
                  </span>
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="grid gap-2 border-t px-3 py-2.5 text-[13px] sm:grid-cols-3">
                  <Bloco titulo="Problema" texto={a.problema} />
                  <Bloco titulo="Em jogo" texto={a.emJogo} />
                  <Bloco titulo="Como fazer" texto={a.comoFazer} destaque />
                </div>
              </details>
            )
          })}
          <p className="text-[10px] text-muted-foreground">
            Sugestões de IA a partir dos dados importados — confira antes de
            aplicar.
          </p>
        </div>
      )}
    </section>
  )
}

function Bloco({
  titulo,
  texto,
  destaque,
}: {
  titulo: string
  texto: string
  destaque?: boolean
}) {
  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <p
        className={`mt-0.5 leading-snug ${destaque ? "font-medium" : "text-muted-foreground"}`}
      >
        {texto}
      </p>
    </div>
  )
}
