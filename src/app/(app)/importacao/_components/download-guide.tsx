"use client"

import * as React from "react"
import {
  BookOpen,
  Calendar,
  ChevronDown,
  Receipt,
  Star,
  Ticket,
  UtensilsCrossed,
} from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { PlatformLogo, type PlatformId } from "@/components/platform-logo"

type GuideEntry = {
  icon: React.ComponentType<{ className?: string }>
  title: string
  badge: string
  badgeTone: "amber" | "blue" | "emerald"
  /** "1 por loja" | "1 da rede" — o ponto de confusão nº1 do time */
  scope: string
  path: string[]
  steps: string
  feeds: string
}

const IFOOD_ENTRIES: GuideEntry[] = [
  {
    icon: UtensilsCrossed,
    title: "Cardápio",
    badge: "Diário ou Mensal",
    badgeTone: "blue",
    scope: "1 por dia ou rede",
    path: ["iFood Gestor", "Operação", "Cardápio"],
    steps:
      'Escolhe período e loja → "Exportar dados" → XLSX. Diário = 1 dia; mensal = rede inteira.',
    feeds: "Funil de conversão, top itens, top complementos.",
  },
  {
    icon: Receipt,
    title: "Conciliação / Repasse",
    badge: "Mensal",
    badgeTone: "amber",
    scope: "1 por loja",
    path: ["iFood Gestor", "Financeiro", "Conciliação"],
    steps:
      'Filtra loja → competência → "Baixar relatório completo" (XLSX). Repete por loja.',
    feeds: "Faturamento bruto/líquido, quebra de taxas, cancelamentos.",
  },
  {
    icon: Star,
    title: "Avaliações",
    badge: "Semanal ou Mensal",
    badgeTone: "emerald",
    scope: "1 da rede",
    path: ["iFood Gestor", "Operação", "Avaliações"],
    steps:
      '"Comentários e avaliações" → período → "Exportar" (XLSX). 1 arquivo cobre as 10 lojas.',
    feeds: "Nota média, top elogios/reclamações, comentários.",
  },
  {
    icon: Ticket,
    title: "Pedidos (VR)",
    badge: "Mensal",
    badgeTone: "amber",
    scope: "1 por loja",
    path: ["iFood Gestor", "Financeiro", "Pedidos"],
    steps:
      '"Relatório de pedidos" → loja + período → "Exportar" (XLSX). Repete por loja.',
    feeds: "Vale-Refeição por bandeira, mix de pagamento, VR no Resultado.",
  },
]

const NINEFOOD_ENTRIES: GuideEntry[] = [
  {
    icon: Receipt,
    title: "Dados da loja",
    badge: "Diário (agregado)",
    badgeTone: "amber",
    scope: "1 da rede",
    path: ["99 Food Merchant", "Baixar dados", "Dados da loja"],
    steps:
      "Marca lojas + datas + métricas → exporta. O sistema separa por loja.",
    feeds: "Faturamento, comissão, avaliação, taxa de aceitação, preparo.",
  },
  {
    icon: UtensilsCrossed,
    title: "Dados do item",
    badge: "Diário",
    badgeTone: "blue",
    scope: "1 da rede",
    path: ["99 Food Merchant", "Baixar dados", "Dados do item"],
    steps: 'Marca "Dados do item" → lojas + datas. As métricas vêm padrão.',
    feeds: "Top itens, funil de carrinho, preço médio por loja.",
  },
  {
    icon: Star,
    title: "Dados do pedido",
    badge: "Por período",
    badgeTone: "emerald",
    scope: "1 da rede",
    path: ["99 Food Merchant", "Baixar dados", "Dados do pedido"],
    steps:
      'Marca "Dados do pedido" → lojas + período. Inclui avaliação e cliente novo/recorrente.',
    feeds: "Notas, top tags, comentários, % clientes novos.",
  },
]

const KEETA_ENTRIES: GuideEntry[] = [
  {
    icon: Receipt,
    title: "Dados do restaurante",
    badge: "Diário (agregado)",
    badgeTone: "amber",
    scope: "1 da rede",
    path: ["Keeta Merchant", "Relatórios", "Config. de dados"],
    steps:
      'Chip "Dados do restaurante" → todos os restaurantes → período → "Selecionar todos os dados". Baixa na aba "Downloads".',
    feeds: "Faturamento, pedidos, cancelados, funil, preparo.",
  },
  {
    icon: Star,
    title: "Dados do pedido",
    badge: "Por período",
    badgeTone: "emerald",
    scope: "1 da rede",
    path: ["Keeta Merchant", "Relatórios", "Config. de dados"],
    steps:
      'Chip "Dados do pedido" → todos → período → todos os dados → "Downloads".',
    feeds: "Faturamento líquido, cancelamentos, notas e comentários.",
  },
  {
    icon: UtensilsCrossed,
    title: "Dados do item",
    badge: "Diário",
    badgeTone: "blue",
    scope: "1 da rede",
    path: ["Keeta Merchant", "Relatórios", "Config. de dados"],
    steps:
      'Chip "Dados do item" → todos → período → todos os dados → "Downloads".',
    feeds: "Top produtos, preço médio, alcance por item.",
  },
  {
    icon: Ticket,
    title: "Pedidos recentes",
    badge: "Por período",
    badgeTone: "emerald",
    scope: "1 da rede",
    path: ["Keeta Merchant", "Pedidos", "Pedidos recentes"],
    steps:
      'Em "Pedidos recentes" → escolhe o período → "Exportar" (XLSX). 1 arquivo cobre todas as lojas.',
    feeds:
      "Subsídio Keeta×loja, taxas granulares e campanhas — alimenta a tela de Pedidos.",
  },
]

const toneClass: Record<GuideEntry["badgeTone"], string> = {
  amber:
    "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400",
  emerald:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
}

const PLATFORMS: { id: PlatformId; label: string; entries: GuideEntry[] }[] = [
  { id: "ifood", label: "iFood", entries: IFOOD_ENTRIES },
  { id: "99food", label: "99 Food", entries: NINEFOOD_ENTRIES },
  { id: "keeta", label: "Keeta", entries: KEETA_ENTRIES },
]

export function DownloadGuide() {
  const [active, setActive] = React.useState<PlatformId>("ifood")
  const current = PLATFORMS.find((p) => p.id === active) ?? PLATFORMS[0]

  return (
    <Collapsible className="group/guide rounded-xl border bg-card">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/40">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <BookOpen className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">
              Como baixar os relatórios — guia rápido
            </p>
            <p className="text-[11px] text-muted-foreground">
              Escolhe a plataforma pra ver os relatórios dela. Clica pra
              expandir.
            </p>
          </div>
        </div>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[panel-open]/guide:rotate-180" />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-t p-4">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {PLATFORMS.map((p) => {
              const isActive = p.id === active
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActive(p.id)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "border-primary bg-primary/10 text-foreground"
                      : "bg-card text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <PlatformLogo platform={p.id} size="sm" />
                  {p.label}
                  <span
                    className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
                      isActive ? "bg-primary/20" : "bg-muted"
                    }`}
                  >
                    {p.entries.length}
                  </span>
                </button>
              )
            })}
          </div>

          <div
            className={`grid gap-3 ${
              current.entries.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2"
            }`}
          >
            {current.entries.map((e) => (
              <EntryCard key={e.title} entry={e} />
            ))}
          </div>
        </div>

        <div className="border-t bg-muted/30 px-5 py-3">
          <p className="text-[11px] text-muted-foreground">
            <strong className="text-foreground">Dica:</strong> arrasta vários
            XLSX (de qualquer plataforma) de uma vez na zona de upload — o
            sistema identifica plataforma, relatório e loja sozinho.
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function EntryCard({ entry: e }: { entry: GuideEntry }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-background p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-muted">
            <e.icon className="size-3.5 text-foreground" />
          </div>
          <p className="text-sm font-bold">{e.title}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneClass[e.badgeTone]}`}
        >
          <Calendar className="size-2.5" />
          {e.badge}
        </span>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        <span className="mr-1 rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
          {e.scope}
        </span>
        {e.path.join(" → ")}
      </p>

      <p className="text-[11px] leading-relaxed">
        <span className="font-semibold">Baixar: </span>
        {e.steps}
      </p>

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground/80">Alimenta: </span>
        {e.feeds}
      </p>
    </div>
  )
}
