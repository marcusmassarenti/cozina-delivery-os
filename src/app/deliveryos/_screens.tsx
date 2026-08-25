"use client"

import { useEffect, useRef, useState } from "react"
import type { PorCem } from "@/lib/data/landing-numeros"
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bike,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleCheck,
  CreditCard,
  DollarSign,
  Flame,
  Home,
  Hourglass,
  Landmark,
  Megaphone,
  Plug,
  Plus,
  Store,
  TriangleAlert,
  Users,
  UtensilsCrossed,
  Package,
  Percent,
  Receipt,
  RefreshCw,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react"

const PLAT = {
  ifood: { label: "iFood", bg: "#EA1D2C" },
  "99food": { label: "99 Food", bg: "#FFD300" },
  keeta: { label: "Keeta", bg: "#FFCD00" },
} as const

export type PlatId = keyof typeof PLAT

/** Logo oficial da plataforma (reaproveita /platforms/{id}.png do app). */
export function PlatLogo({
  id,
  size = 44,
  className = "",
}: {
  id: PlatId
  size?: number
  className?: string
}) {
  const c = PLAT[id]
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl ${className}`}
      style={{ width: size, height: size, background: c.bg }}
      title={c.label}
      aria-label={c.label}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/platforms/${id}.png`} alt={c.label} className="size-full object-contain p-1.5" />
    </span>
  )
}

/** Trio de logos (como nos cards de KPI do app real). */
function PlatBadges() {
  return (
    <span className="flex items-center gap-0.5">
      <PlatLogo id="ifood" size={15} className="rounded-[4px]" />
      <PlatLogo id="99food" size={15} className="rounded-[4px]" />
      <PlatLogo id="keeta" size={15} className="rounded-[4px]" />
    </span>
  )
}

/* ─── Primitivos das telas (tema escuro, fiel ao app real) ──────────────── */

function BrowserBar({ label = "deliveryos.food/app" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[oklch(0.19_0.004_60)] px-3.5 py-2.5">
      <span className="size-2.5 rounded-full bg-white/15" />
      <span className="size-2.5 rounded-full bg-white/15" />
      <span className="size-2.5 rounded-full bg-white/15" />
      <span className="ml-2 truncate font-mono text-xs text-[oklch(0.6_0_0)]">{label}</span>
    </div>
  )
}

function Screen({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[oklch(0.175_0.004_60)] text-left shadow-[0_24px_50px_-24px_rgba(0,0,0,.55)]">
      <BrowserBar label={label} />
      <div className="p-4">{children}</div>
    </div>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone = "plain",
  badges = false,
}: {
  icon: LucideIcon
  label: string
  value: string
  sub?: string
  tone?: "plain" | "green" | "amber"
  badges?: boolean
}) {
  const toneCls =
    tone === "green"
      ? "text-[oklch(0.8_0.16_150)]"
      : tone === "amber"
        ? "text-[oklch(0.83_0.15_82)]"
        : "text-white"
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[oklch(0.225_0.005_60)] p-3.5">
      <div className="flex items-start justify-between">
        <span className="flex size-8 items-center justify-center rounded-lg bg-[oklch(0.36_0.1_33)] text-[oklch(0.85_0.14_55)]">
          <Icon className="size-4" strokeWidth={2} />
        </span>
        {badges ? <PlatBadges /> : null}
      </div>
      <p className="mt-2.5 text-[10px] font-medium uppercase tracking-wider text-[oklch(0.6_0_0)]">{label}</p>
      <p className={`mt-0.5 text-xl font-medium tabular-nums leading-tight ${toneCls}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] text-[oklch(0.55_0_0)]">{sub}</p> : null}
    </div>
  )
}

/* ─── Telas ─────────────────────────────────────────────────────────────── */

/** Painel principal — hero (flutua). Fiel ao Dashboard real (dark + badges). */
export function DashboardMock() {
  const linhas: { id: PlatId; valor: string; w: string }[] = [
    { id: "ifood", valor: "R$ 9.120", w: "74%" },
    { id: "99food", valor: "R$ 5.870", w: "48%" },
    { id: "keeta", valor: "R$ 3.440", w: "28%" },
  ]
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.12] bg-[oklch(0.175_0.004_60)] text-left shadow-[0_40px_90px_-28px_rgba(0,0,0,.75)]">
      <BrowserBar />
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Painel da rede</p>
            <p className="text-[11px] text-[oklch(0.6_0_0)]">Visão consolidada · maio/2026</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-[oklch(0.32_0.1_150)] px-2.5 py-1 text-[11px] font-medium text-[oklch(0.85_0.16_150)]">
            <TrendingUp className="size-3" strokeWidth={2.6} />
            +12%
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Kpi icon={DollarSign} label="Faturamento" value="R$ 64.200" badges />
          <Kpi icon={Wallet} label="Líquido" value="R$ 52.260" tone="green" badges />
          <Kpi icon={Percent} label="Taxas" value="R$ 11.940" tone="amber" badges />
          <Kpi icon={TrendingUp} label="Lucro líq." value="R$ 18.430" tone="green" badges />
        </div>
        <div className="mt-2.5 rounded-xl border border-white/[0.07] bg-[oklch(0.225_0.005_60)] p-3.5">
          <p className="mb-2.5 text-[10px] font-medium uppercase tracking-wider text-[oklch(0.6_0_0)]">
            Lucro por plataforma
          </p>
          <div className="space-y-2.5">
            {linhas.map((l) => (
              <div key={l.id}>
                <div className="mb-1.5 flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-2 text-[oklch(0.85_0_0)]">
                    <PlatLogo id={l.id} size={18} className="rounded-md" />
                    {PLAT[l.id].label}
                  </span>
                  <span className="font-medium tabular-nums text-white">{l.valor}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
                  <div className="bar-fill h-2 rounded-full bg-[var(--brand)]" style={{ width: l.w }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Visão da unidade (loja) — header da marca + 6 KPIs + split + DRE. */
export function UnidadeMock() {
  const split = [
    { id: "ifood" as PlatId, v: "R$ 14,1k", p: "57%", c: "#EA1D2C", w: "57%" },
    { id: "99food" as PlatId, v: "R$ 2,5k", p: "10%", c: "#FFD300", w: "10%" },
    { id: "keeta" as PlatId, v: "R$ 8,2k", p: "33%", c: "#19b894", w: "33%" },
  ]
  return (
    <Screen label="deliveryos.food/unidades/01">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
            <Flame className="size-5" strokeWidth={2} />
          </span>
          <div>
            <p className="flex items-center gap-2 font-medium text-white">
              Loja Centro
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">#01</span>
            </p>
            <p className="text-[11px] text-white/45">São Paulo · SP</p>
          </div>
        </div>
        <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/60">maio/2026</span>
      </div>

      <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[oklch(0.3_0.07_150)] px-2.5 py-1 text-[11px] font-medium text-[oklch(0.83_0.15_150)]">
        <Sparkles className="size-3" strokeWidth={2.4} />
        KPIs de iFood + 99 Food + Keeta
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniKpi label="Bruto" value="R$ 24,8k" />
        <MiniKpi label="Líquido" value="R$ 13,9k" tone="green" />
        <MiniKpi label="Margem" value="16,6%" tone="green" />
        <MiniKpi label="Ticket" value="R$ 52" />
        <MiniKpi label="Cancelam." value="1,2%" />
        <MiniKpi label="Nota" value="4,7 ★" />
      </div>

      <div className="mt-3 rounded-xl border border-white/[0.07] bg-[oklch(0.225_0.005_60)] p-3.5">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[oklch(0.6_0_0)]">Faturamento por plataforma</p>
        <div className="flex h-2.5 overflow-hidden rounded-full">
          {split.map((s) => (
            <div key={s.id} style={{ width: s.w, background: s.c }} />
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
          {split.map((s) => (
            <span key={s.id} className="flex items-center gap-1.5 text-[oklch(0.7_0_0)]">
              <PlatLogo id={s.id} size={15} className="rounded-[4px]" />
              <span className="font-medium text-white">{s.v}</span> {s.p}
            </span>
          ))}
        </div>
      </div>
    </Screen>
  )
}

function MiniKpi({ label, value, tone = "plain" }: { label: string; value: string; tone?: "plain" | "green" }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[oklch(0.225_0.005_60)] px-2.5 py-2">
      <p className="text-[9px] font-medium uppercase tracking-wider text-[oklch(0.58_0_0)]">{label}</p>
      <p className={`mt-0.5 text-base font-medium tabular-nums ${tone === "green" ? "text-[oklch(0.8_0.16_150)]" : "text-white"}`}>{value}</p>
    </div>
  )
}

/** Funil de conversão (rede). */
export function FunilMock() {
  const etapas = [
    { l: "Visitas", v: "38.400", p: 100, c: "#3b82f6" },
    { l: "Visualizações", v: "20.300", p: 53, c: "#8b5cf6" },
    { l: "Sacola", v: "11.100", p: 29, c: "#a855f7" },
    { l: "Concluídos", v: "7.600", p: 20, c: "#22c55e" },
  ]
  return (
    <Screen label="deliveryos.food (funil)">
      <p className="text-sm font-medium text-white">Funil de conversão · rede</p>
      <div className="mt-4 space-y-3">
        {etapas.map((e) => (
          <div key={e.l}>
            <div className="mb-1 flex items-center justify-between text-[13px]">
              <span className="text-[oklch(0.72_0_0)]">{e.l}</span>
              <span className="font-medium tabular-nums text-white">{e.v}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-2 rounded-full" style={{ width: `${e.p}%`, background: e.c }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-[oklch(0.28_0.07_150)] px-3.5 py-2.5">
        <span className="text-[13px] text-[oklch(0.82_0.15_150)]">Conversão da rede</span>
        <span className="text-lg font-medium tabular-nums text-[oklch(0.85_0.16_150)]">19,8%</span>
      </div>
    </Screen>
  )
}

/** Top produtos (rede). */
export function TopProdutosMock() {
  const itens = [
    { n: "Combo Família", q: "1.240 vendidos", v: "R$ 12,1k" },
    { n: "Burger Duplo", q: "980 vendidos", v: "R$ 8,4k" },
    { n: "Porção Fritas G", q: "760 vendidos", v: "R$ 6,3k" },
    { n: "Açaí 700ml", q: "540 vendidos", v: "R$ 5,2k" },
    { n: "Pizza Grande", q: "410 vendidos", v: "R$ 4,1k" },
  ]
  return (
    <Screen label="deliveryos.food (top produtos)">
      <p className="flex items-center gap-2 text-sm font-medium text-white">
        <Package className="size-4 text-[oklch(0.78_0.14_55)]" strokeWidth={2} />
        Top produtos · rede
      </p>
      <div className="mt-3 space-y-1.5">
        {itens.map((it, i) => (
          <div key={it.n} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-[oklch(0.225_0.005_60)] px-3 py-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-[10px] font-medium text-[oklch(0.7_0_0)]">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-white">{it.n}</p>
              <p className="text-[11px] text-[oklch(0.55_0_0)]">{it.q}</p>
            </div>
            <span className="font-medium tabular-nums text-[oklch(0.8_0.16_150)]">{it.v}</span>
          </div>
        ))}
      </div>
    </Screen>
  )
}

/** "Mágica dos números": relatório bruto (claro) → painel limpo (dark). */
export function MagicaNumeros() {
  const cols = ["tipo_lancamento", "descricao_lancamento", "valor", "base_calculo", "perc_taxa"]
  const rows = [
    ["Cobrança", "Comissão do iFood", "-9,86", "42,89", "23,0%"],
    ["Retenção", "Taxa entrega iFood", "-7,99", "0,00", "0,0%"],
    ["Entrada", "Entrada Financeira", "46,55", "46,55", "0,0%"],
    ["Subsídio", "Promoção custeada loja", "-4,99", "-4,99", "0,0%"],
    ["Cobrança", "Taxa de transação", "-1,37", "42,89", "3,2%"],
    ["Ressarc.", "Pedido cancelado", "41,99", "0,00", "0,0%"],
  ]
  return (
    <div className="grid items-center gap-5 md:grid-cols-[1fr_auto_1fr]">
      <div className="relative overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-black/[0.06] bg-[oklch(0.97_0.004_75)] px-3 py-2">
          <span className="size-2 rounded-[3px] bg-[oklch(0.5_0.15_145)]" />
          <span className="truncate font-mono text-[11px] text-[oklch(0.5_0.01_48)]">relatorio_financeiro_ifood.xlsx</span>
        </div>
        <div className="overflow-hidden p-1 opacity-90 [filter:grayscale(.4)]">
          <table className="w-full border-collapse font-mono text-[10px] text-[oklch(0.45_0.01_48)]">
            <thead>
              <tr className="bg-black/[0.03]">
                {cols.map((c) => (
                  <td key={c} className="border border-black/[0.05] px-1.5 py-1 text-[oklch(0.55_0.01_48)]">{c}</td>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {r.map((cell, j) => (
                    <td key={j} className="border border-black/[0.05] px-1.5 py-1 tabular-nums">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent" />
        <p className="px-3 pb-2 pt-1 text-center text-[11px] font-medium text-[oklch(0.55_0.01_48)]">O que a plataforma te entrega</p>
      </div>

      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[var(--brand)] text-white shadow-[0_12px_28px_-10px_oklch(0.65_0.21_35/.8)] max-md:rotate-90">
        <ArrowRight className="size-6" strokeWidth={2.2} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[oklch(0.175_0.004_60)] shadow-[0_24px_50px_-24px_rgba(0,0,0,.55)]">
        <BrowserBar />
        <div className="p-4">
          <p className="text-xs text-[oklch(0.62_0_0)]">Lucro líquido · maio</p>
          <p className="mt-1 text-[28px] font-medium leading-none tracking-tight text-white">R$ 18.430</p>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {[
              { l: "Margem real", v: "28,7%", t: "green" as const },
              { l: "Taxa média", v: "18,6%", t: "amber" as const },
              { l: "Pedidos", v: "1.284", t: "plain" as const },
              { l: "Ticket médio", v: "R$ 50", t: "plain" as const },
            ].map((k) => (
              <div key={k.l} className="rounded-xl border border-white/[0.06] bg-[oklch(0.225_0.005_60)] px-3 py-2">
                <p className="text-[11px] text-[oklch(0.58_0_0)]">{k.l}</p>
                <p className={`text-base font-medium tabular-nums ${k.t === "green" ? "text-[oklch(0.8_0.16_150)]" : k.t === "amber" ? "text-[oklch(0.83_0.15_82)]" : "text-white"}`}>{k.v}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-[11px] font-medium text-[oklch(0.78_0.14_55)]">O que o Delivery OS te mostra</p>
        </div>
      </div>
    </div>
  )
}

/** DRE / Resultado (dark) — KPIs + cascata. */
export function DreMock() {
  const cascata = [
    { l: "Faturamento bruto", v: "R$ 64.200", t: "white" as const },
    { l: "− Taxas das plataformas", v: "−R$ 11.940", t: "neg" as const },
    { l: "− CMV (insumos)", v: "−R$ 22.180", t: "neg" as const },
    { l: "− Operação e equipe", v: "−R$ 11.650", t: "neg" as const },
  ]
  return (
    <Screen label="deliveryos.food/financeiro">
      <p className="text-sm font-medium text-white">DRE da rede · maio</p>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <Kpi icon={DollarSign} label="Bruto" value="R$ 64.200" />
        <Kpi icon={Wallet} label="Líquido" value="R$ 52.260" tone="green" />
      </div>
      <div className="mt-3 space-y-2 rounded-xl border border-white/[0.07] bg-[oklch(0.225_0.005_60)] p-3.5 text-[13px]">
        {cascata.map((r) => (
          <div key={r.l} className="flex items-center justify-between">
            <span className="text-[oklch(0.66_0_0)]">{r.l}</span>
            <span className={`tabular-nums ${r.t === "neg" ? "text-[oklch(0.72_0.16_25)]" : "font-medium text-white"}`}>{r.v}</span>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between rounded-lg bg-[oklch(0.34_0.1_33)] px-3 py-2">
          <span className="font-medium text-[oklch(0.88_0.12_55)]">= Lucro líquido</span>
          <span className="text-base font-medium tabular-nums text-[oklch(0.9_0.13_55)]">R$ 18.430</span>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[11px] text-[oklch(0.55_0_0)]">
        <span>Margem 28,7%</span>
        <span>aberto por plataforma</span>
      </div>
    </Screen>
  )
}

/** Relatório Diário (dark) — switchers + KPIs + barras por dia. */
export function RelatorioDiarioMock() {
  const dias = [62, 48, 80, 55, 70, 92, 74, 60, 85, 68, 78, 95]
  return (
    <Screen label="deliveryos.food/relatorio-diario">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-[var(--brand)] px-2.5 py-1 text-[11px] font-medium text-white">Faturamento</span>
        <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-[oklch(0.62_0_0)]">Pedidos</span>
        <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-[oklch(0.62_0_0)]">Cancelados</span>
        <span className="ml-auto flex items-center gap-1">
          <PlatLogo id="ifood" size={18} className="rounded-md" />
          <PlatLogo id="99food" size={18} className="rounded-md" />
          <PlatLogo id="keeta" size={18} className="rounded-md" />
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        <Kpi icon={DollarSign} label="Faturamento" value="R$ 8,3k" />
        <Kpi icon={Receipt} label="Pedidos" value="176" />
        <Kpi icon={BarChart3} label="Ticket" value="R$ 47" />
      </div>
      <div className="mt-3 rounded-xl border border-white/[0.07] bg-[oklch(0.225_0.005_60)] p-3.5">
        <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-[oklch(0.6_0_0)]">Faturamento por dia</p>
        <div className="flex h-20 items-end gap-1">
          {dias.map((h, i) => (
            <div key={i} className="flex-1 rounded-t bg-[oklch(0.62_0.14_150)]" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    </Screen>
  )
}

/** Avaliações (dark) — KPIs + distribuição + o que elogiam. */
export function AvaliacoesMock() {
  const dist = [
    { e: 5, w: "82%", n: 14, c: "oklch(0.62 0.14 150)" },
    { e: 4, w: "10%", n: 2, c: "oklch(0.7 0.14 150)" },
    { e: 3, w: "5%", n: 1, c: "oklch(0.8 0.14 82)" },
    { e: 2, w: "3%", n: 1, c: "oklch(0.7 0.16 40)" },
    { e: 1, w: "0%", n: 0, c: "oklch(0.7 0.16 25)" },
  ]
  const elogios = [
    { t: "Comida excelente", n: 43 },
    { t: "Bem embalado", n: 39 },
    { t: "Como na foto", n: 35 },
  ]
  return (
    <Screen label="deliveryos.food/avaliacoes">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-white/[0.07] bg-[oklch(0.225_0.005_60)] p-3.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[oklch(0.6_0_0)]">Nota média</p>
          <p className="mt-1 flex items-center gap-1.5 text-2xl font-medium text-white">
            4,7
            <Star className="size-5 fill-[#FFB400] text-[#FFB400]" />
          </p>
          <p className="mt-0.5 text-[11px] text-[oklch(0.55_0_0)]">320 avaliações</p>
        </div>
        <Kpi icon={Star} label="5 estrelas" value="82%" tone="green" sub="263 avaliações" />
      </div>
      <div className="mt-3 rounded-xl border border-white/[0.07] bg-[oklch(0.225_0.005_60)] p-3.5">
        <p className="mb-2.5 text-[10px] font-medium uppercase tracking-wider text-[oklch(0.6_0_0)]">Distribuição das notas</p>
        <div className="space-y-1.5">
          {dist.map((d) => (
            <div key={d.e} className="flex items-center gap-2 text-[11px]">
              <span className="flex w-7 items-center gap-0.5 text-[oklch(0.7_0_0)]">
                {d.e}
                <Star className="size-2.5 fill-[#FFB400] text-[#FFB400]" />
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                <div className="h-2 rounded-full" style={{ width: d.w, background: d.c }} />
              </div>
              <span className="w-5 text-right tabular-nums text-[oklch(0.6_0_0)]">{d.n}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2.5 rounded-xl border border-white/[0.07] bg-[oklch(0.225_0.005_60)] p-3.5">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[oklch(0.6_0_0)]">O que elogiam</p>
        <div className="space-y-1.5">
          {elogios.map((e) => (
            <div key={e.t} className="flex items-center justify-between text-[12px]">
              <span className="text-[oklch(0.75_0_0)]">{e.t}</span>
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.08]">
                  <span className="block h-1.5 rounded-full bg-[oklch(0.62_0.14_150)]" style={{ width: `${Math.min(100, e.n * 2)}%` }} />
                </span>
                <span className="w-5 text-right tabular-nums text-[oklch(0.6_0_0)]">{e.n}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </Screen>
  )
}

/* ─── Dashboard completo que rola sozinho (loop) ────────────────────────── */

function DashSection({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-2.5 pt-1">
      <span className="flex size-5 items-center justify-center rounded-full bg-[var(--brand)] text-[10px] font-medium text-white">{n}</span>
      <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[oklch(0.55_0_0)]">{label}</span>
      <span className="ml-2 h-px flex-1 bg-white/[0.06]" />
    </div>
  )
}

function DCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-white/[0.07] bg-[oklch(0.205_0.004_60)] p-3.5">{children}</div>
}

/**
 * Dashboard inteiro (fiel ao app) num frame que rola sozinho em loop — o
 * "screen-recording" do produto. Pausa no hover; respeita reduced-motion.
 */
export function DashboardScroll() {
  const perf: { icon: LucideIcon; l: string; v: string; s?: string; tone?: "plain" | "green" | "amber" }[] = [
    { icon: Receipt, l: "Pedidos totais", v: "1.284" },
    { icon: XCircle, l: "Cancelados", v: "18", s: "1,4% dos pedidos" },
    { icon: CalendarDays, l: "Média/dia", v: "41" },
    { icon: BarChart3, l: "Ticket médio", v: "R$ 50,12" },
    { icon: DollarSign, l: "Total bruto", v: "R$ 64.200" },
    { icon: Wallet, l: "Total líquido", v: "R$ 36.700", tone: "green" },
    { icon: Percent, l: "Taxa de repasse", v: "57,2%", s: "acima da média (~52%)", tone: "green" },
    { icon: Bike, l: "Custo de entrega", v: "R$ 9.100", s: "14,2% do bruto" },
    { icon: Star, l: "Nota média", v: "4,7 ★", s: "320 aval · 4,1% neg" },
  ]
  const plat: { id: PlatId; v: string; pct: string; w: string }[] = [
    { id: "ifood", v: "R$ 36,6k", pct: "57% líquido pra loja", w: "57%" },
    { id: "99food", v: "R$ 8,2k", pct: "80% líquido pra loja", w: "80%" },
    { id: "keeta", v: "R$ 19,4k", pct: "54% líquido pra loja", w: "54%" },
  ]
  const funil = [
    { l: "Visitas", v: "38.400", p: 100, c: "#3b82f6" },
    { l: "Visualizações", v: "20.300", p: 53, c: "#8b5cf6" },
    { l: "Sacola", v: "11.100", p: 29, c: "#a855f7" },
    { l: "Concluídos", v: "7.600", p: 20, c: "#22c55e" },
  ]
  const cancel = [
    { m: "Sem motivo informado", n: 8 },
    { m: "Pedido atrasado", n: 4 },
    { m: "Itens errados", n: 2 },
  ]
  const produtos = [
    { n: "Combo Família", q: "1.240", v: "R$ 12,1k" },
    { n: "Burger Duplo", q: "980", v: "R$ 8,4k" },
    { n: "Porção Fritas G", q: "760", v: "R$ 6,3k" },
    { n: "Açaí 700ml", q: "540", v: "R$ 5,2k" },
  ]
  const dist = [
    { e: 5, w: "82%", n: 263, c: "oklch(0.62 0.14 150)" },
    { e: 4, w: "10%", n: 32, c: "oklch(0.7 0.14 150)" },
    { e: 3, w: "5%", n: 16, c: "oklch(0.8 0.14 82)" },
    { e: 2, w: "2%", n: 6, c: "oklch(0.7 0.16 40)" },
    { e: 1, w: "1%", n: 3, c: "oklch(0.7 0.16 25)" },
  ]
  const elogios = [
    { t: "Comida excelente", n: 43 },
    { t: "Bem embalado", n: 39 },
    { t: "Como na foto", n: 35 },
    { t: "Recomendaria", n: 34 },
  ]
  const coment: { id: PlatId; s: number; t: string; d: string }[] = [
    { id: "99food", s: 5, t: "Chegou quentinho e super rápido, recomendo!", d: "2 dias" },
    { id: "ifood", s: 5, t: "Porção generosa e bem embalada.", d: "3 dias" },
    { id: "keeta", s: 4, t: "Sabor ótimo, só demorou um pouquinho.", d: "4 dias" },
  ]

  // Auto-scroll vertical em loop (ping-pong). Pausa no hover e libera o scroll
  // manual (rodinha do mouse) pra pessoa explorar o painel sozinha.
  const vpRef = useRef<HTMLDivElement>(null)
  const pausedRef = useRef(false)
  const dirRef = useRef(1)
  useEffect(() => {
    const vp = vpRef.current
    if (!vp) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    // Só mexe quando o frame está visível — fora da tela não faz paint à toa.
    let visible = true
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), {
      threshold: 0,
    })
    io.observe(vp)
    let raf = 0
    let last = 0
    const step = (t: number) => {
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0
      last = t
      if (visible && !pausedRef.current) {
        const max = vp.scrollHeight - vp.clientHeight
        if (max > 4) {
          let next = vp.scrollTop + dirRef.current * 26 * dt
          if (next >= max) {
            next = max
            dirRef.current = -1
          } else if (next <= 0) {
            next = 0
            dirRef.current = 1
          }
          vp.scrollTop = next
        }
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
    }
  }, [])
  const pause = () => {
    pausedRef.current = true
    if (vpRef.current) vpRef.current.style.overflowY = "auto"
  }
  const resume = () => {
    pausedRef.current = false
    if (vpRef.current) vpRef.current.style.overflowY = "hidden"
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.1] bg-[oklch(0.165_0.004_60)] shadow-[0_40px_90px_-28px_rgba(0,0,0,.75)]">
      <BrowserBar label="deliveryos.food/app" />
      <div className="relative">
        <div
          ref={vpRef}
          data-lenis-prevent
          onMouseEnter={pause}
          onMouseLeave={resume}
          className="no-scrollbar"
          style={{ height: 460, overflowY: "hidden" }}
        >
          <div className="space-y-3.5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-medium text-white">Dashboard</p>
              <p className="text-[11px] text-[oklch(0.55_0_0)]">Sua loja · maio/2026</p>
            </div>
            <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/60">maio/2026</span>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[oklch(0.4_0.06_150/0.35)] bg-[oklch(0.23_0.04_150)] px-3.5 py-2.5">
            <span className="flex items-center gap-2 text-[12px] text-[oklch(0.84_0.13_150)]">
              <CircleCheck className="size-4" strokeWidth={2} />
              Nenhum alerta este mês — sua loja no azul
            </span>
            <PlatBadges />
          </div>

          <DashSection n={1} label="Performance da operação" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {perf.map((k) => (
              <Kpi key={k.l} icon={k.icon} label={k.l} value={k.v} sub={k.s} tone={k.tone} badges />
            ))}
          </div>

          <DashSection n={2} label="Visão geral por plataforma" />
          <div className="grid gap-2 sm:grid-cols-3">
            {plat.map((p) => (
              <DCard key={p.id}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[13px] font-medium text-white">
                    <PlatLogo id={p.id} size={20} className="rounded-md" />
                    {PLAT[p.id].label}
                  </span>
                  <span className="text-[13px] font-medium tabular-nums text-white">{p.v}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                  <div className="h-1.5 rounded-full bg-[oklch(0.62_0.14_150)]" style={{ width: p.w }} />
                </div>
                <p className="mt-1.5 text-[11px] text-[oklch(0.55_0_0)]">{p.pct}</p>
              </DCard>
            ))}
          </div>

          <DashSection n={3} label="Cardápio & cancelamentos" />
          <div className="grid gap-2 sm:grid-cols-3">
            <DCard>
              <p className="text-[12px] font-medium text-white">Funil de conversão</p>
              <div className="mt-2.5 space-y-2">
                {funil.map((f) => (
                  <div key={f.l}>
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="text-[oklch(0.65_0_0)]">{f.l}</span>
                      <span className="font-medium tabular-nums text-white">{f.v}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-1.5 rounded-full" style={{ width: `${f.p}%`, background: f.c }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2.5 flex items-center justify-between rounded-lg bg-[oklch(0.27_0.06_150)] px-2.5 py-1.5 text-[11px]">
                <span className="text-[oklch(0.8_0.14_150)]">Conversão</span>
                <span className="font-medium text-[oklch(0.85_0.16_150)]">19,8%</span>
              </div>
            </DCard>
            <DCard>
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-white">
                <ThumbsDown className="size-3.5 text-[oklch(0.72_0.16_25)]" strokeWidth={2} />
                Top cancelamentos
              </p>
              <div className="mt-2.5 space-y-1.5">
                {cancel.map((c) => (
                  <div key={c.m} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate text-[oklch(0.7_0_0)]">{c.m}</span>
                    <span className="flex shrink-0 items-center gap-1 text-[oklch(0.72_0.16_25)]">
                      <XCircle className="size-3" strokeWidth={2.4} />
                      {c.n}
                    </span>
                  </div>
                ))}
              </div>
            </DCard>
            <DCard>
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-white">
                <Package className="size-3.5 text-[oklch(0.78_0.14_55)]" strokeWidth={2} />
                Top produtos
              </p>
              <div className="mt-2.5 space-y-1.5">
                {produtos.map((it, i) => (
                  <div key={it.n} className="flex items-center gap-2 text-[11px]">
                    <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-[9px] text-[oklch(0.65_0_0)]">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-white">{it.n}</span>
                    <span className="shrink-0 font-medium tabular-nums text-[oklch(0.8_0.16_150)]">{it.v}</span>
                  </div>
                ))}
              </div>
            </DCard>
          </div>

          <DashSection n={4} label="Satisfação dos clientes" />
          <div className="grid gap-2 sm:grid-cols-3">
            <DCard>
              <p className="text-[12px] font-medium text-white">Distribuição das notas</p>
              <div className="mt-2.5 space-y-1.5">
                {dist.map((d) => (
                  <div key={d.e} className="flex items-center gap-2 text-[10px]">
                    <span className="flex w-6 items-center gap-0.5 text-[oklch(0.7_0_0)]">{d.e}<Star className="size-2 fill-[#FFB400] text-[#FFB400]" /></span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                      <div className="h-1.5 rounded-full" style={{ width: d.w, background: d.c }} />
                    </div>
                    <span className="w-6 text-right tabular-nums text-[oklch(0.6_0_0)]">{d.n}</span>
                  </div>
                ))}
              </div>
            </DCard>
            <DCard>
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-white">
                <ThumbsUp className="size-3.5 text-[oklch(0.72_0.14_150)]" strokeWidth={2} />
                O que elogiam
              </p>
              <div className="mt-2.5 space-y-1.5">
                {elogios.map((e) => (
                  <div key={e.t} className="flex items-center justify-between text-[11px]">
                    <span className="text-[oklch(0.72_0_0)]">{e.t}</span>
                    <span className="font-medium tabular-nums text-[oklch(0.65_0_0)]">{e.n}</span>
                  </div>
                ))}
              </div>
            </DCard>
            <DCard>
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-white">
                <ThumbsDown className="size-3.5 text-[oklch(0.72_0.16_25)]" strokeWidth={2} />
                O que reclamam
              </p>
              <div className="mt-4 flex flex-col items-center justify-center gap-1 py-2 text-center">
                <CircleCheck className="size-6 text-[oklch(0.7_0.14_150)]" strokeWidth={1.8} />
                <p className="text-[11px] text-[oklch(0.7_0.13_150)]">Nenhuma reclamação relevante no mês</p>
              </div>
            </DCard>
          </div>

          <DashSection n={5} label="Últimos comentários" />
          <DCard>
            <div className="space-y-2.5">
              {coment.map((c, i) => (
                <div key={i} className="border-b border-white/[0.05] pb-2.5 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <PlatLogo id={c.id} size={16} className="rounded-[4px]" />
                    <span className="flex">
                      {Array.from({ length: c.s }).map((_, k) => (
                        <Star key={k} className="size-2.5 fill-[#FFB400] text-[#FFB400]" />
                      ))}
                    </span>
                    <span className="ml-auto text-[10px] text-[oklch(0.5_0_0)]">há {c.d}</span>
                  </div>
                  <p className="mt-1 text-[11px] italic text-[oklch(0.78_0_0)]">“{c.t}”</p>
                </div>
              ))}
            </div>
          </DCard>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-[oklch(0.165_0.004_60)] to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[oklch(0.165_0.004_60)] to-transparent" />
      </div>
    </div>
  )
}

/* ─── "Onde seu dinheiro vai": barra animada das taxas (a dor) ───────────── */

/** "31.5" → "31,50"; "1" → "1". Reais com vírgula, sem centavo inútil. */
function brl(v: number): string {
  return Number.isInteger(v)
    ? String(v)
    : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Do vermelho ao amarelo: a ordem dos segmentos já vem do maior pro menor. */
const CORES_SEG = ["#e2483f", "#ee7536", "#ef8f2e", "#efb12a", "#e3c238", "#d9cc4a", "#cdd06a"]

export function PainBreakdown({ porCem }: { porCem: PorCem }) {
  const ref = useRef<HTMLDivElement>(null)
  const [show, setShow] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShow(true)
          io.disconnect()
        }
      },
      { threshold: 0.3 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  /**
   * ⚠️ ESTES NÚMEROS ERAM ESCRITOS À MÃO (comissão 23, entrega 7, cupom 6,
   * frete grátis 6, transação 3 = R$ 45).
   *
   * Agora vêm do mesmo cálculo diário dos outros números da página. E o
   * medido saiu MAIS FORTE que o inventado: a composição real mostra que a
   * maior sangria depois da comissão é a PROMOÇÃO QUE A LOJA BANCOU — algo
   * que o lojista escolhe e quase nunca soma. "Cupom" e "frete grátis" eram
   * duas linhas chutadas; a real é uma só, e maior que as duas juntas.
   */
  const segs = porCem.segmentos.map((s, i) => ({
    ...s,
    c: CORES_SEG[i % CORES_SEG.length]!,
  }))
  const taxas = porCem.total
  const sobra = porCem.sobra

  return (
    <div
      ref={ref}
      className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[oklch(0.185_0.008_45)] p-6 text-white shadow-[0_30px_70px_-30px_rgba(0,0,0,.6)] sm:p-9"
    >
      <p className="text-center text-sm text-[oklch(0.68_0_0)]">
        De cada <span className="font-medium text-white">R$ 100</span> que entram pelo delivery…
      </p>

      <div className="mx-auto mt-5 flex h-14 max-w-2xl overflow-hidden rounded-2xl bg-white/[0.04]">
        {segs.map((s, i) => (
          <div
            key={s.l}
            className="h-full shrink-0"
            style={{
              width: show ? `${s.v}%` : "0%",
              background: s.c,
              transition: "width .85s cubic-bezier(.22,1,.36,1)",
              transitionDelay: `${i * 200}ms`,
            }}
          />
        ))}
        <div
          className="flex h-full min-w-0 flex-1 items-center justify-center"
          style={{ background: "oklch(0.5 0.15 150)" }}
        >
          <span className="px-2 text-sm font-medium text-white">sobra R$ {brl(sobra)}</span>
        </div>
      </div>

      <p className="mt-6 text-center text-2xl font-medium leading-snug sm:text-3xl">
        Somem{" "}
        <span className="text-[oklch(0.76_0.17_28)]">R$ {brl(taxas)}</span>. Sobram{" "}
        <span className="text-[oklch(0.82_0.16_150)]">R$ {brl(sobra)}</span>.
      </p>
      {/* A média esconde o caso que dói. A mediana diz como é a loja típica; o
          p90 diz quantas estão muito pior — e é esse par que faz o leitor se
          perguntar em qual metade ele está. */}
      <p className="mt-1.5 text-center text-sm text-[oklch(0.6_0_0)]">
        Na loja típica somem R$ {brl(porCem.mediana)}. Mas em{" "}
        <span className="text-white">uma a cada dez</span>, passa de R${" "}
        {brl(Math.floor(porCem.p90))} — e quase ninguém percebe.
      </p>

      <div className="mx-auto mt-6 grid max-w-2xl grid-cols-1 gap-x-10 gap-y-3 text-[13px] sm:grid-cols-2">
        {segs.map((s) => (
          <span
            key={s.l}
            className="flex items-center justify-between gap-3 text-[oklch(0.72_0_0)]"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ background: s.c }}
              />
              <span className="truncate">{s.l}</span>
            </span>
            <span className="shrink-0 tabular-nums text-white">−R$ {brl(s.v)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/* ─── Fluxo de Caixa (módulo Pro) — fiel ao /caixa ──────────────────────── */

/** Logo real do banco (arquivos em /public/banks), pro mock de Contas. */
function BankLogo({ slug, size = 24 }: { slug: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white"
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/banks/${slug}.png`} alt="" className="size-full object-cover" />
    </span>
  )
}

/**
 * Caixa / Fluxo de Caixa (Pro): KPIs de receita/despesa/saldo, contas bancárias
 * com extrato conciliado (OFX) e as contas a pagar com vencimentos.
 */
export function CaixaMock() {
  const kpis = [
    { l: "Receita do mês", v: "R$ 48,3k", icon: TrendingUp, c: "text-[oklch(0.8_0.16_150)]" },
    { l: "Despesa do mês", v: "R$ 31,8k", icon: TrendingDown, c: "text-[oklch(0.74_0.16_25)]" },
    { l: "Balanço", v: "+R$ 16,6k", icon: Wallet, c: "text-[oklch(0.8_0.16_150)]" },
  ] as const
  const contas = [
    { slug: "nubank", name: "Nubank PJ", v: "R$ 12.480" },
    { slug: "itau", name: "Itaú", v: "R$ 7.350" },
    { slug: "inter", name: "Inter", v: "R$ 2.350" },
  ]
  const apagar = [
    { l: "Fornecedor de carnes", d: "vence 14/06", v: "R$ 4.200", late: false },
    { l: "Aluguel", d: "atrasado · venceu 10/06", v: "R$ 6.500", late: true },
    { l: "Energia (CPFL)", d: "vence 18/06", v: "R$ 1.180", late: false },
  ]
  return (
    <Screen label="deliveryos.food/caixa">
      <div className="flex items-center justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-white">
            Fluxo de Caixa
            <span className="rounded bg-[oklch(0.36_0.1_33)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[oklch(0.88_0.13_55)]">
              Pro
            </span>
          </p>
          <p className="text-[11px] text-[oklch(0.6_0_0)]">Consolidado · junho/2026</p>
        </div>
        <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/60">
          junho/2026
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {kpis.map((k) => (
          <div key={k.l} className="rounded-xl border border-white/[0.07] bg-[oklch(0.225_0.005_60)] p-3">
            <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-wider text-[oklch(0.58_0_0)]">
              <k.icon className="size-3.5" strokeWidth={2} />
              {k.l}
            </div>
            <p className={`mt-1 text-base font-medium tabular-nums leading-tight ${k.c}`}>{k.v}</p>
          </div>
        ))}
      </div>

      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
        {/* Contas bancárias + OFX */}
        <div className="rounded-xl border border-white/[0.07] bg-[oklch(0.225_0.005_60)] p-3.5">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-[oklch(0.6_0_0)]">
              <Landmark className="size-3.5" />
              Minhas contas
            </p>
            <span className="inline-flex items-center gap-1 rounded-full bg-[oklch(0.3_0.07_150)] px-2 py-0.5 text-[9px] font-medium text-[oklch(0.83_0.15_150)]">
              <RefreshCw className="size-2.5" strokeWidth={2.6} />
              OFX
            </span>
          </div>
          <div className="space-y-2.5">
            {contas.map((a) => (
              <div key={a.slug} className="flex items-center gap-2.5">
                <BankLogo slug={a.slug} size={22} />
                <span className="flex-1 truncate text-[12px] font-medium text-white">{a.name}</span>
                <span className="text-[12px] font-medium tabular-nums text-white">{a.v}</span>
              </div>
            ))}
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t border-white/[0.06] pt-2.5 text-[11px]">
            <span className="text-[oklch(0.6_0_0)]">Saldo em conta</span>
            <span className="font-medium tabular-nums text-white">R$ 22.180</span>
          </div>
        </div>

        {/* Contas a pagar */}
        <div className="rounded-xl border border-white/[0.07] bg-[oklch(0.225_0.005_60)] p-3.5">
          <p className="mb-2.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-[oklch(0.6_0_0)]">
            <AlertTriangle className="size-3.5" />
            Contas a pagar
          </p>
          <div className="space-y-2">
            {apagar.map((e) => (
              <div key={e.l} className="flex items-center gap-2.5">
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${
                    e.late
                      ? "bg-[oklch(0.34_0.1_25)] text-[oklch(0.82_0.15_25)]"
                      : "bg-white/[0.06] text-[oklch(0.65_0_0)]"
                  }`}
                >
                  <Receipt className="size-3.5" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-white">{e.l}</p>
                  <p
                    className={`text-[10px] ${
                      e.late ? "text-[oklch(0.74_0.15_25)]" : "text-[oklch(0.55_0_0)]"
                    }`}
                  >
                    {e.d}
                  </p>
                </div>
                <span className="text-[12px] font-medium tabular-nums text-[oklch(0.75_0.16_25)]">
                  −{e.v}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Screen>
  )
}

/* ─── Carrossel de telas do Caixa (Pro) — roda sozinho pra direita ───────── */

/** 1) Consolidado multi-loja: comparativo loja a loja (Loja 1…). */
function ConsolidadoContent() {
  const kpis = [
    { l: "Receita do mês", v: "R$ 612k", icon: TrendingUp, c: "text-[oklch(0.8_0.16_150)]" },
    { l: "Despesa do mês", v: "R$ 438k", icon: TrendingDown, c: "text-[oklch(0.74_0.16_25)]" },
    { l: "Balanço", v: "+R$ 174k", icon: Wallet, c: "text-[oklch(0.8_0.16_150)]" },
    { l: "Saldo em conta", v: "R$ 286k", icon: Landmark, c: "text-white" },
  ] as const
  const lojas = [
    { n: "Loja 1", saldo: "38.420", rec: "9.200", pag: "6.500", res: "+12.300" },
    { n: "Loja 2", saldo: "24.180", rec: "5.400", pag: "8.100", res: "+7.900" },
    { n: "Loja 3", saldo: "41.060", rec: "11.300", pag: "4.900", res: "+15.600" },
    { n: "Loja 4", saldo: "19.540", rec: "3.800", pag: "7.200", res: "+5.200" },
    { n: "Loja 5", saldo: "33.700", rec: "8.100", pag: "5.600", res: "+10.400" },
  ]
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-white">
          Fluxo de Caixa
          <span className="rounded bg-[oklch(0.36_0.1_33)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[oklch(0.88_0.13_55)]">
            Pro
          </span>
        </p>
        <span className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/70">
          <Store className="size-3" strokeWidth={2} />
          Consolidado · 18 lojas
          <ChevronDown className="size-3 text-white/40" strokeWidth={2.4} />
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.l} className="rounded-xl border border-white/[0.07] bg-[oklch(0.225_0.005_60)] p-2.5">
            <div className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider text-[oklch(0.58_0_0)]">
              <k.icon className="size-3 shrink-0" strokeWidth={2} />
              <span className="truncate">{k.l}</span>
            </div>
            <p className={`mt-0.5 text-[15px] font-medium tabular-nums ${k.c}`}>{k.v}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-white/[0.07] bg-[oklch(0.205_0.004_60)] p-3.5">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-[oklch(0.6_0_0)]">
            <Store className="size-3.5" />
            Comparativo por loja
          </p>
          <span className="text-[10px] text-[oklch(0.5_0_0)]">clique pra abrir</span>
        </div>
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-wider text-[oklch(0.5_0_0)]">
              <td className="pb-1.5 text-left font-medium">Loja</td>
              <td className="pb-1.5 text-right font-medium">Saldo</td>
              <td className="hidden pb-1.5 text-right font-medium sm:table-cell">A receber</td>
              <td className="pb-1.5 text-right font-medium">A pagar</td>
              <td className="pb-1.5 text-right font-medium">Resultado</td>
            </tr>
          </thead>
          <tbody>
            {lojas.map((l) => (
              <tr key={l.n} className="border-t border-white/[0.05]">
                <td className="py-1.5 text-left font-medium text-white">{l.n}</td>
                <td className="py-1.5 text-right tabular-nums text-[oklch(0.78_0_0)]">R$ {l.saldo}</td>
                <td className="hidden py-1.5 text-right tabular-nums text-[oklch(0.78_0.13_150)] sm:table-cell">
                  R$ {l.rec}
                </td>
                <td className="py-1.5 text-right tabular-nums text-[oklch(0.78_0.14_55)]">R$ {l.pag}</td>
                <td className="py-1.5 text-right font-medium tabular-nums text-[oklch(0.82_0.16_150)]">R$ {l.res}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 border-t border-white/[0.05] pt-2 text-center text-[10px] text-[oklch(0.5_0_0)]">
          + 13 outras lojas no consolidado
        </p>
      </div>
    </div>
  )
}

/** 2) Lançamentos: contas a pagar e a receber, com status. */
function LancamentosContent() {
  const chips = [
    { l: "Recebido", v: "R$ 486k", c: "text-[oklch(0.8_0.16_150)]" },
    { l: "Pago", v: "R$ 312k", c: "text-[oklch(0.74_0.16_25)]" },
    { l: "A receber", v: "R$ 41k", c: "text-[oklch(0.78_0.13_150)]" },
    { l: "A pagar", v: "R$ 58k", c: "text-[oklch(0.8_0.14_55)]" },
  ]
  const ST = {
    ok: { l: "Confirmado", c: "text-[oklch(0.8_0.15_150)]", I: CheckCircle2 },
    late: { l: "Atrasado", c: "text-[oklch(0.75_0.16_25)]", I: TriangleAlert },
    wait: { l: "Pendente", c: "text-[oklch(0.6_0_0)]", I: Hourglass },
  } as const
  const rows: { t: string; s: string; st: keyof typeof ST; v: string; out: boolean }[] = [
    { t: "iFood — repasse semanal", s: "Recebimento · Nubank PJ · 12/06", st: "ok", v: "+R$ 18.640", out: false },
    { t: "Fornecedor de carnes", s: "Insumos · vence 14/06", st: "wait", v: "−R$ 4.200", out: true },
    { t: "Aluguel", s: "Ocupação · venceu 10/06", st: "late", v: "−R$ 6.500", out: true },
    { t: "99Food — repasse", s: "Recebimento · Itaú · 11/06", st: "ok", v: "+R$ 5.870", out: false },
    { t: "Energia (CPFL)", s: "Utilidades · vence 18/06", st: "wait", v: "−R$ 1.180", out: true },
    { t: "Embalagens", s: "Insumos · 08/06", st: "ok", v: "−R$ 2.340", out: true },
  ]
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-white">
          Lançamentos <span className="font-normal text-[oklch(0.55_0_0)]">· junho/2026</span>
        </p>
        <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/60">
          Todas as lojas
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {chips.map((c) => (
          <div key={c.l} className="rounded-xl border border-white/[0.07] bg-[oklch(0.225_0.005_60)] p-2.5">
            <p className="text-[9px] font-medium uppercase tracking-wider text-[oklch(0.58_0_0)]">{c.l}</p>
            <p className={`mt-0.5 text-[15px] font-medium tabular-nums ${c.c}`}>{c.v}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.07] bg-[oklch(0.205_0.004_60)]">
        {rows.map((r) => {
          const st = ST[r.st]
          return (
            <div key={r.t} className="flex items-center gap-2.5 border-b border-white/[0.05] px-3 py-2 last:border-0">
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${
                  r.out
                    ? "bg-[oklch(0.32_0.08_25)] text-[oklch(0.82_0.14_25)]"
                    : "bg-[oklch(0.3_0.07_150)] text-[oklch(0.83_0.14_150)]"
                }`}
              >
                {r.out ? (
                  <TrendingDown className="size-3.5" strokeWidth={2} />
                ) : (
                  <TrendingUp className="size-3.5" strokeWidth={2} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-white">{r.t}</p>
                <p className="truncate text-[10px] text-[oklch(0.55_0_0)]">{r.s}</p>
              </div>
              <span className={`hidden items-center gap-1 text-[10px] font-medium sm:flex ${st.c}`}>
                <st.I className="size-3" strokeWidth={2.2} />
                {st.l}
              </span>
              <span
                className={`shrink-0 text-[12px] font-medium tabular-nums ${
                  r.out ? "text-[oklch(0.75_0.16_25)]" : "text-[oklch(0.8_0.16_150)]"
                }`}
              >
                {r.v}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** 3) Contas & Cartões: bancos conciliados (OFX) + fatura do cartão. */
function ContasCartoesContent() {
  const contas = [
    { slug: "nubank", name: "Nubank PJ", v: "R$ 12.480" },
    { slug: "itau", name: "Itaú", v: "R$ 7.350" },
    { slug: "inter", name: "Inter", v: "R$ 2.350" },
  ]
  const compras = [
    { n: "Atacadão — hortifruti", v: "R$ 1.240" },
    { n: "Posto Shell — frota", v: "R$ 680" },
    { n: "Mercado Livre — utensílios", v: "R$ 410" },
  ]
  return (
    <div>
      <p className="text-sm font-medium text-white">Contas &amp; Cartões</p>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {/* Contas bancárias + OFX */}
        <div className="rounded-xl border border-white/[0.07] bg-[oklch(0.225_0.005_60)] p-3.5">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-[oklch(0.6_0_0)]">
              <Landmark className="size-3.5" />
              Minhas contas
            </p>
            <span className="inline-flex items-center gap-1 rounded-full bg-[oklch(0.3_0.07_150)] px-2 py-0.5 text-[9px] font-medium text-[oklch(0.83_0.15_150)]">
              <RefreshCw className="size-2.5" strokeWidth={2.6} />
              OFX
            </span>
          </div>
          <div className="space-y-2.5">
            {contas.map((a) => (
              <div key={a.slug} className="flex items-center gap-2.5">
                <BankLogo slug={a.slug} size={22} />
                <span className="flex-1 truncate text-[12px] font-medium text-white">{a.name}</span>
                <span className="text-[12px] font-medium tabular-nums text-white">{a.v}</span>
              </div>
            ))}
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t border-white/[0.06] pt-2.5 text-[11px]">
            <span className="text-[oklch(0.6_0_0)]">Saldo em conta</span>
            <span className="font-medium tabular-nums text-white">R$ 22.180</span>
          </div>
        </div>

        {/* Cartão de crédito */}
        <div className="rounded-xl border border-white/[0.07] bg-[oklch(0.225_0.005_60)] p-3.5">
          <div className="flex items-center gap-2.5">
            <BankLogo slug="c6-bank" size={26} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-white">Crédito C6</p>
              <p className="text-[10px] text-[oklch(0.55_0_0)]">Fecha dia 4 · Vence dia 12</p>
            </div>
            <span className="rounded-full bg-[oklch(0.32_0.08_25)] px-2 py-0.5 text-[9px] font-semibold uppercase text-[oklch(0.82_0.14_25)]">
              Em aberto
            </span>
          </div>
          <div className="mt-2.5 grid grid-cols-3 gap-2 border-y border-white/[0.06] py-2.5 text-center">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-[oklch(0.55_0_0)]">Fatura</p>
              <p className="text-[12px] font-medium tabular-nums text-[oklch(0.78_0.14_25)]">R$ 8.420</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-[oklch(0.55_0_0)]">Disponível</p>
              <p className="text-[12px] font-medium tabular-nums text-white">R$ 16.580</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-[oklch(0.55_0_0)]">Limite</p>
              <p className="text-[12px] font-medium tabular-nums text-[oklch(0.7_0_0)]">R$ 25.000</p>
            </div>
          </div>
          <div className="mt-2 space-y-1.5">
            {compras.map((c) => (
              <div key={c.n} className="flex items-center gap-2 text-[11px]">
                <CreditCard className="size-3 shrink-0 text-[oklch(0.55_0_0)]" strokeWidth={2} />
                <span className="flex-1 truncate text-[oklch(0.72_0_0)]">{c.n}</span>
                <span className="tabular-nums text-[oklch(0.78_0.12_25)]">{c.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** 4) Categorias: pra onde vai o dinheiro, com ícone, cor e barra. */
function CategoriasContent() {
  const cats = [
    { n: "Insumos (CMV)", v: "R$ 18.400", w: "100%", icon: UtensilsCrossed, c: "#e2483f" },
    { n: "Folha / Salários", v: "R$ 7.200", w: "39%", icon: Users, c: "#ee7536" },
    { n: "Aluguel", v: "R$ 6.500", w: "35%", icon: Home, c: "#efa427" },
    { n: "Embalagens", v: "R$ 2.340", w: "13%", icon: Package, c: "#e3c238" },
    { n: "Marketing", v: "R$ 2.100", w: "11%", icon: Megaphone, c: "#8b5cf6" },
    { n: "Energia & água", v: "R$ 1.480", w: "8%", icon: Plug, c: "#3b82f6" },
  ]
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-white">Categorias</p>
        <div className="flex gap-0.5 rounded-lg bg-white/[0.06] p-0.5 text-[11px]">
          <span className="rounded-md bg-[var(--brand)] px-2.5 py-0.5 font-medium text-white">Despesas</span>
          <span className="px-2.5 py-0.5 text-[oklch(0.6_0_0)]">Receitas</span>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-[oklch(0.55_0_0)]">Pra onde foi o dinheiro · junho/2026</p>

      <div className="mt-3 space-y-2.5">
        {cats.map((c) => (
          <div key={c.n}>
            <div className="mb-1 flex items-center gap-2 text-[12px]">
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-md"
                style={{ background: `${c.c}26`, color: c.c }}
              >
                <c.icon className="size-3.5" strokeWidth={2} />
              </span>
              <span className="flex-1 truncate text-white">{c.n}</span>
              <span className="font-medium tabular-nums text-[oklch(0.78_0_0)]">{c.v}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full" style={{ width: c.w, background: c.c }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const CAIXA_SCREENS = [
  { id: "consolidado", label: "Consolidado", url: "deliveryos.food/caixa", Content: ConsolidadoContent },
  { id: "lancamentos", label: "Lançamentos", url: "deliveryos.food/caixa/lancamentos", Content: LancamentosContent },
  { id: "contas", label: "Contas & Cartões", url: "deliveryos.food/caixa/cartoes", Content: ContasCartoesContent },
  { id: "categorias", label: "Categorias", url: "deliveryos.food/caixa/categorias", Content: CategoriasContent },
] as const

/**
 * Carrossel das telas do Caixa (Pro): roda sozinho pra direita passando por
 * Consolidado → Lançamentos → Contas & Cartões → Categorias. Pausa no hover,
 * tem abas/dots clicáveis e respeita prefers-reduced-motion.
 */
export function CaixaCarousel() {
  const [i, setI] = useState(0)
  const pausedRef = useRef(false)
  const visRef = useRef(true)
  const rootRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<(HTMLDivElement | null)[]>([])
  const [h, setH] = useState<number | undefined>(undefined)

  // Altura do frame acompanha a tela ativa (sem sobrar espaço embaixo).
  useEffect(() => {
    const measure = () => {
      const el = slideRefs.current[i]
      if (el) setH(el.offsetHeight)
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [i])

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const el = rootRef.current
    let io: IntersectionObserver | null = null
    if (el) {
      io = new IntersectionObserver(([e]) => (visRef.current = e.isIntersecting), { threshold: 0.2 })
      io.observe(el)
    }
    const id = window.setInterval(() => {
      if (!pausedRef.current && visRef.current) {
        setI((v) => (v + 1) % CAIXA_SCREENS.length)
      }
    }, 3800)
    return () => {
      window.clearInterval(id)
      io?.disconnect()
    }
  }, [])

  const active = CAIXA_SCREENS[i]

  return (
    <div
      ref={rootRef}
      onMouseEnter={() => {
        pausedRef.current = true
      }}
      onMouseLeave={() => {
        pausedRef.current = false
      }}
      className="overflow-hidden rounded-2xl border border-white/[0.1] bg-[oklch(0.165_0.004_60)] shadow-[0_40px_90px_-28px_rgba(0,0,0,.75)]"
    >
      <BrowserBar label={active.url} />

      {/* Abas (nomeiam cada tela poderosa) */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.06] px-3 py-2.5">
        {CAIXA_SCREENS.map((s, n) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setI(n)}
            className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
              n === i
                ? "bg-[var(--brand)] text-white"
                : "bg-white/[0.05] text-[oklch(0.62_0_0)] hover:bg-white/[0.1]"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Trilho que desliza pra direita (altura acompanha a tela ativa) */}
      <div
        className="overflow-hidden transition-[height] duration-500 ease-[cubic-bezier(.22,1,.36,1)]"
        style={{ height: h }}
      >
        <div
          className="flex items-start transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)]"
          style={{ transform: `translateX(-${i * 100}%)` }}
        >
          {CAIXA_SCREENS.map((s, n) => (
            <div
              key={s.id}
              ref={(el) => {
                slideRefs.current[n] = el
              }}
              className="w-full shrink-0 p-4"
            >
              <s.Content />
            </div>
          ))}
        </div>
      </div>

      {/* Indicadores */}
      <div className="flex items-center justify-center gap-1.5 pb-3.5 pt-1">
        {CAIXA_SCREENS.map((s, n) => (
          <button
            key={s.id}
            type="button"
            aria-label={s.label}
            onClick={() => setI(n)}
            className={`h-1.5 rounded-full transition-all ${
              n === i ? "w-5 bg-[var(--brand)]" : "w-1.5 bg-white/20 hover:bg-white/35"
            }`}
          />
        ))}
      </div>
    </div>
  )
}

