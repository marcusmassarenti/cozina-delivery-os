"use client"

import * as React from "react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { fmtBRL, fmtBRLShort, fmtNum } from "@/lib/format"

type SeriePlat = {
  ifood: (number | null)[]
  ninefood: (number | null)[]
  keeta: (number | null)[]
  cardapioweb: (number | null)[]
}
export type SerieEvolucao = {
  meses: string[]
  faturamento: SeriePlat
  ticket: SeriePlat
  pedidos: SeriePlat
  nota: SeriePlat
  cancelamento: SeriePlat
}

type MetricaId = "faturamento" | "ticket" | "pedidos" | "nota" | "cancelamento"
const METRICAS: { id: MetricaId; label: string }[] = [
  { id: "faturamento", label: "Faturamento" },
  { id: "ticket", label: "Ticket médio" },
  { id: "pedidos", label: "Pedidos" },
  { id: "nota", label: "Nota" },
  { id: "cancelamento", label: "Cancelamento" },
]
// Só faturamento e pedidos SOMAM entre plataformas → % de participação faz
// sentido. Ticket e nota são médias (não somam 100%), então sem %.
const ADITIVAS = new Set<MetricaId>(["faturamento", "pedidos"])

// Cores de marca (amarelo do 99 puxado p/ dourado por contraste; identidade
// reforçada por logo + legenda, não só a cor).
const COR: Record<PlatformId, string> = {
  ifood: "#EA1D2C",
  "99food": "#E0A400",
  keeta: "#0E9E96",
  cardapioweb: "#5B2A86",
}

type Linha = { nome: string; cor: string; plat: PlatformId; valores: (number | null)[] }

/**
 * Gráfico principal do dashboard, mês a mês, com SELETOR de métrica — TODAS por
 * plataforma (iFood/99/Keeta): Faturamento, Ticket médio, Pedidos, Nota. SVG
 * puro, compacto, eixo Y de referência, logos e tooltip (com % de participação
 * nas métricas que somam).
 */
export function GraficoPrincipal({
  serie,
  metricas,
}: {
  serie: SerieEvolucao
  /** Restringe quais métricas aparecem no seletor (default: todas). */
  metricas?: string[]
}) {
  const visiveis = metricas
    ? METRICAS.filter((m) => metricas.includes(m.id))
    : METRICAS
  const [metrica, setMetrica] = React.useState<MetricaId>("faturamento")
  const [hover, setHover] = React.useState<number | null>(null)

  const n = serie.meses.length
  const dados = serie[metrica]
  const linhas: Linha[] = (
    [
    { nome: "iFood", plat: "ifood", cor: COR.ifood, valores: dados.ifood },
    { nome: "99 Food", plat: "99food", cor: COR["99food"], valores: dados.ninefood },
    { nome: "Keeta", plat: "keeta", cor: COR.keeta, valores: dados.keeta },
    {
      nome: "Cardápio Web",
      plat: "cardapioweb",
      cor: COR.cardapioweb,
      valores: dados.cardapioweb,
    },
    ] as Linha[]
  )
    // Série toda vazia não vira linha nem legenda — canal que a loja não usa
    // não deve poluir o gráfico com uma reta no zero.
    .filter((l) => l.valores.some((v) => v !== null && v !== 0))
  const mostraPct = ADITIVAS.has(metrica)

  const fmt = (v: number) =>
    metrica === "nota"
      ? `${v.toFixed(2).replace(".", ",")} ★`
      : metrica === "cancelamento"
        ? `${v.toFixed(1).replace(".", ",")}%`
        : metrica === "pedidos"
          ? fmtNum(v)
          : fmtBRL(v)
  const fmtEixo = (v: number) =>
    metrica === "nota"
      ? v.toFixed(1).replace(".", ",")
      : metrica === "cancelamento"
        ? `${v.toFixed(1).replace(".", ",")}%`
        : metrica === "pedidos"
          ? fmtNum(Math.round(v))
          : fmtBRLShort(v)

  const todos = linhas.flatMap((l) => l.valores).filter((v): v is number => v != null)
  const maxV = Math.max(1, ...todos)
  const yMax = metrica === "nota" ? 5 : maxV
  const yMin =
    metrica === "nota"
      ? Math.max(0, Math.min(...(todos.length ? todos : [4])) - 0.4)
      : 0

  const W = 640
  const H = 132
  const padL = 52
  const padR = 12
  const padT = 12
  const padB = 22
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const x = (i: number) =>
    padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const y = (v: number) =>
    padT + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH

  const pathDe = (valores: (number | null)[]) => {
    let d = ""
    let aberto = false
    valores.forEach((v, i) => {
      if (v == null) {
        aberto = false
        return
      }
      d += `${aberto ? "L" : "M"}${x(i)},${y(v)} `
      aberto = true
    })
    return d.trim()
  }

  const ticks = [yMin, (yMin + yMax) / 2, yMax]
  const ativoIdx = hover
  const totalMesAtivo =
    ativoIdx != null && mostraPct
      ? linhas.reduce((s, l) => s + (l.valores[ativoIdx] ?? 0), 0)
      : 0
  // Linha-resumo do tooltip: total do mês (faturamento/pedidos) ou média
  // ponderada (ticket = faturamento do mês ÷ pedidos do mês — não é a média
  // simples dos tickets, senão loja pequena pesaria igual à grande).
  const resumoMes = (() => {
    if (ativoIdx == null) return null
    if (mostraPct && totalMesAtivo > 0)
      return { label: "Total do mês", texto: fmt(totalMesAtivo) }
    if (metrica === "ticket") {
      const soma = (sp: SeriePlat) =>
        (["ifood", "ninefood", "keeta", "cardapioweb"] as const).reduce(
          (s, k) => s + (sp[k][ativoIdx] ?? 0),
          0,
        )
      const fat = soma(serie.faturamento)
      const ped = soma(serie.pedidos)
      if (ped > 0) return { label: "Média do mês", texto: fmtBRL(fat / ped) }
    }
    return null
  })()

  return (
    <div>
      {/* Seletor de métrica */}
      <div className="mb-2 flex flex-wrap gap-1">
        {visiveis.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMetrica(m.id)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              metrica === m.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Evolução de ${metrica} por plataforma, mês a mês`}
        >
          {ticks.map((t, i) => {
            const gy = y(t)
            return (
              <g key={i}>
                <line
                  x1={padL}
                  x2={W - padR}
                  y1={gy}
                  y2={gy}
                  className="text-border"
                  stroke="currentColor"
                  strokeWidth={1}
                  strokeDasharray="2 4"
                />
                <text
                  x={padL - 6}
                  y={gy + 3}
                  textAnchor="end"
                  className="fill-muted-foreground"
                  style={{ fontSize: 9 }}
                >
                  {fmtEixo(t)}
                </text>
              </g>
            )
          })}

          {ativoIdx != null && (
            <line
              x1={x(ativoIdx)}
              x2={x(ativoIdx)}
              y1={padT}
              y2={padT + innerH}
              className="text-muted-foreground"
              stroke="currentColor"
              strokeWidth={1}
              opacity={0.3}
            />
          )}

          {linhas.map((l) => (
            <path
              key={l.nome}
              d={pathDe(l.valores)}
              fill="none"
              stroke={l.cor}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {ativoIdx != null &&
            linhas.map((l) => {
              const v = l.valores[ativoIdx]
              if (v == null) return null
              return (
                <circle
                  key={l.nome}
                  cx={x(ativoIdx)}
                  cy={y(v)}
                  r={3.5}
                  fill={l.cor}
                  stroke="var(--background, #fff)"
                  strokeWidth={2}
                />
              )
            })}

          {serie.meses.map((mes, i) => (
            <text
              key={i}
              x={x(i)}
              y={H - 6}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: 10 }}
            >
              {mes}
            </text>
          ))}

          {serie.meses.map((_, i) => {
            const left = i === 0 ? padL : (x(i - 1) + x(i)) / 2
            const right = i === n - 1 ? W : (x(i) + x(i + 1)) / 2
            return (
              <rect
                key={i}
                x={left}
                y={0}
                width={Math.max(1, right - left)}
                height={H}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            )
          })}
        </svg>

        {/* Tooltip */}
        {ativoIdx != null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-md"
            style={{
              left: `${Math.min(84, Math.max(16, (x(ativoIdx) / W) * 100))}%`,
              top: 0,
            }}
          >
            <div className="mb-1 font-semibold">{serie.meses[ativoIdx]}</div>
            {linhas.map((l) => {
              const v = l.valores[ativoIdx]
              const pct =
                mostraPct && v != null && totalMesAtivo > 0
                  ? Math.round((v / totalMesAtivo) * 100)
                  : null
              return (
                <div key={l.nome} className="mt-0.5 flex items-center gap-1.5">
                  <PlatformLogo platform={l.plat} size="sm" className="size-4" />
                  <span className="text-muted-foreground">{l.nome}</span>
                  <span className="font-semibold tabular-nums">
                    {v == null ? "—" : fmt(v)}
                  </span>
                  {pct != null && (
                    <span className="text-muted-foreground tabular-nums">
                      ({pct}%)
                    </span>
                  )}
                </div>
              )
            })}
            {resumoMes && (
              <div className="mt-1 flex items-center justify-between gap-3 border-t pt-1">
                <span className="text-muted-foreground">{resumoMes.label}</span>
                <span className="font-bold tabular-nums">{resumoMes.texto}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legenda: traço da cor + logo + nome */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-muted-foreground">
        {linhas.map((l) => (
          <span key={l.nome} className="flex items-center gap-1.5">
            <span
              className="h-[3px] w-4 rounded-full"
              style={{ background: l.cor }}
            />
            <PlatformLogo platform={l.plat} size="sm" className="size-4" />
            {l.nome}
          </span>
        ))}
      </div>
    </div>
  )
}
