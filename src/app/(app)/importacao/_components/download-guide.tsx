"use client"

import * as React from "react"
import {
  BookOpen,
  Calendar,
  ChevronDown,
  ExternalLink,
  PlayCircle,
  Receipt,
  Star,
  Ticket,
  UtensilsCrossed,
  X,
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
  /** Links diretos pro portal do iFood (loja única e/ou portal de redes). */
  links?: { label: string; href: string }[]
}

const IFOOD_ENTRIES: GuideEntry[] = [
  {
    icon: Receipt,
    title: "Financeiro / Conciliação",
    badge: "Mensal",
    badgeTone: "amber",
    scope: "1 por loja",
    path: ["Portal iFood", "Financeiro", "Exportar"],
    steps:
      'Seleciona a competência (mês) → botão "Exportar" → XLSX. É SEMPRE loja por loja (não existe no portal de redes). Repete por loja.',
    feeds:
      "Faturamento bruto/líquido, quebra de taxas, cancelamentos — a base FINANCEIRA oficial (bate com a tela Financeiro do iFood).",
    links: [
      {
        label: "Financeiro (loja por loja)",
        href: "https://portal.ifood.com.br/revenue/billaas/home",
      },
    ],
  },
  {
    icon: Ticket,
    title: "Pedidos (VR / pagamento)",
    badge: "Por período",
    badgeTone: "amber",
    scope: "1 por loja",
    path: ["Portal iFood", "Pedidos", "Exportar"],
    steps:
      'Escolhe o período → "Exportar" → XLSX. SEMPRE loja por loja (não existe no portal de redes). Repete por loja.',
    feeds:
      "Forma de pagamento, Vale-Refeição por bandeira, operação. NÃO é a base de faturamento — pra faturamento use o Financeiro.",
    links: [
      { label: "Pedidos (loja por loja)", href: "https://portal.ifood.com.br/orders" },
    ],
  },
  {
    icon: UtensilsCrossed,
    title: "Cardápio",
    badge: "Mensal",
    badgeTone: "blue",
    scope: "1 por loja",
    path: ["Portal iFood", "Relatórios da loja", "Cardápio"],
    steps:
      'SEMPRE individual da loja, uma por vez → período → "Exportar" → XLSX. ⚠️ Pelo portal de REDES vem só o consolidado (funil por loja, mas os produtos só no TOTAL da marca — sem item por loja).',
    feeds: "Funil de conversão, top itens vendidos e complementos — por loja.",
    links: [
      {
        label: "Cardápio por loja",
        href: "https://portal.ifood.com.br/reports-for-merchant",
      },
    ],
  },
  {
    icon: Star,
    title: "Avaliações",
    badge: "Semanal ou Mensal",
    badgeTone: "emerald",
    scope: "Loja única ou rede",
    path: ["Portal iFood", "Relatórios", "Avaliações"],
    steps:
      'Loja única → portal do lojista; rede/franquia → portal de redes. Período → "Exportar" → XLSX.',
    feeds: "Nota média, top elogios/reclamações, comentários.",
    links: [
      {
        label: "Loja única",
        href: "https://portal.ifood.com.br/reports-for-merchant",
      },
      { label: "Rede / franquia", href: "https://portal.ifood.com.br/chains/reports" },
    ],
  },
]

const NINE_URL = "https://merchant.99app.com/pt-BR/manager/report"
const NINE_LINK = [{ label: "Relatórios 99 Food", href: NINE_URL }]

const NINEFOOD_ENTRIES: GuideEntry[] = [
  {
    icon: Receipt,
    title: "Dados da loja",
    badge: "Mensal",
    badgeTone: "amber",
    scope: "1 por loja",
    path: ["Portal 99 Food", "Relatórios"],
    steps:
      'Período mensal → escolhe a loja (a 99 não tem "todas") → "Selecionar todos os dados" → Enviar. Na aba "Baixar relatório", baixa. Pode subir o .zip.',
    feeds: "Faturamento, comissão, avaliação, taxa de aceitação, preparo.",
    links: NINE_LINK,
  },
  {
    icon: UtensilsCrossed,
    title: "Dados do item",
    badge: "Mensal",
    badgeTone: "blue",
    scope: "1 por loja",
    path: ["Portal 99 Food", "Relatórios"],
    steps:
      'Mesmo fluxo, tipo "Dados do item" → loja + período → todos os dados → Enviar → baixar.',
    feeds: "Top itens, funil de carrinho, preço médio por loja.",
    links: NINE_LINK,
  },
  {
    icon: Star,
    title: "Dados do pedido",
    badge: "Mensal",
    badgeTone: "emerald",
    scope: "1 por loja",
    path: ["Portal 99 Food", "Relatórios"],
    steps:
      'Mesmo fluxo, tipo "Dados do pedido" → loja + período → todos os dados → Enviar → baixar.',
    feeds: "Notas, top tags, comentários, % clientes novos.",
    links: NINE_LINK,
  },
]

const KEETA_URL = "https://merchant.mykeeta.com/m/web/app/bizdata#/dataDownload"
const KEETA_LINK = [{ label: "Baixar dados Keeta", href: KEETA_URL }]
const KEETA_FLOW =
  'Período mensal → restaurante (ou todos, se for rede) → "Selecionar todos os dados" → Enviar. Na aba "Downloads", baixa.'

const KEETA_ENTRIES: GuideEntry[] = [
  {
    icon: Receipt,
    title: "Dados do restaurante",
    badge: "Mensal",
    badgeTone: "amber",
    scope: "Todos ou por loja",
    path: ["Keeta", "Relatórios", "Baixar dados"],
    steps: KEETA_FLOW,
    feeds: "Faturamento, pedidos, cancelados, funil, preparo.",
    links: KEETA_LINK,
  },
  {
    icon: Star,
    title: "Dados do pedido",
    badge: "Mensal",
    badgeTone: "emerald",
    scope: "Todos ou por loja",
    path: ["Keeta", "Relatórios", "Baixar dados"],
    steps: KEETA_FLOW,
    feeds: "Faturamento líquido, cancelamentos, notas e comentários.",
    links: KEETA_LINK,
  },
  {
    icon: UtensilsCrossed,
    title: "Dados do item",
    badge: "Mensal",
    badgeTone: "blue",
    scope: "Todos ou por loja",
    path: ["Keeta", "Relatórios", "Baixar dados"],
    steps: KEETA_FLOW,
    feeds: "Top produtos, preço médio, alcance por item.",
    links: KEETA_LINK,
  },
  {
    icon: Ticket,
    title: "Dados da promoção",
    badge: "Mensal",
    badgeTone: "emerald",
    scope: "Todos ou por loja",
    path: ["Keeta", "Relatórios", "Baixar dados"],
    steps: KEETA_FLOW,
    feeds: "ROI das campanhas, subsídio Keeta×loja, vendas em promoção.",
    links: KEETA_LINK,
  },
]

const toneClass: Record<GuideEntry["badgeTone"], string> = {
  amber:
    "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400",
  emerald:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
}

/** Base pública dos vídeos tutoriais (Supabase Storage, bucket "tutoriais"). */
const TUT =
  "https://srgmmqihgvkmwjkorkva.supabase.co/storage/v1/object/public/tutoriais/"

type Video = { title: string; src: string }

const PLATFORMS: {
  id: PlatformId
  label: string
  entries: GuideEntry[]
  videos?: Video[]
}[] = [
  { id: "ifood", label: "iFood", entries: IFOOD_ENTRIES },
  { id: "99food", label: "99 Food", entries: NINEFOOD_ENTRIES },
  {
    id: "keeta",
    label: "Keeta",
    entries: KEETA_ENTRIES,
    videos: [
      {
        title: "Baixar os relatórios (Restaurante · Pedido · Item · Promoção)",
        src: `${TUT}keeta-baixar-dados.mp4`,
      },
      { title: "Baixar Pedidos", src: `${TUT}keeta-pedidos.mp4` },
    ],
  },
]

export function DownloadGuide() {
  const [active, setActive] = React.useState<PlatformId>("ifood")
  const [video, setVideo] = React.useState<Video | null>(null)
  const current = PLATFORMS.find((p) => p.id === active) ?? PLATFORMS[0]

  return (
    <>
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

          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-[11px] leading-relaxed text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
            {active === "ifood" && (
              <>
                <strong>
                  Faturamento vem do relatório Financeiro / Conciliação
                </strong>{" "}
                — não do de Pedidos (esse é só forma de pagamento / VR). E
                atenção: <strong>Financeiro, Pedidos e Cardápio</strong> são{" "}
                <strong>loja por loja</strong>. No <strong>Cardápio</strong>, o
                portal de redes traz só o consolidado da marca (funil, mas{" "}
                <strong>sem produtos por loja</strong>) — pra ver os produtos de
                cada loja, use o Cardápio individual da loja. Só{" "}
                <strong>Avaliações</strong> funciona de verdade por rede.
              </>
            )}
            {active === "99food" && (
              <>
                A 99 <strong>não deixa selecionar todas as lojas</strong> — baixe
                os <strong>3 relatórios de cada loja</strong>, uma por uma
                (período mensal → todos os dados → Enviar → aba "Baixar
                relatório"). Pode subir o <strong>.zip</strong> direto, o sistema
                lê.
              </>
            )}
            {active === "keeta" && (
              <>
                Baixe os <strong>4 relatórios</strong> (restaurante, pedido, item
                e promoção) pra ter a info completa. É um fluxo só: período mensal
                → restaurante (ou todos, se for rede) → "Selecionar todos os
                dados" → Enviar → aba <strong>Downloads</strong> → Baixar.
              </>
            )}
          </div>

          {current.videos && current.videos.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Vídeos tutoriais
              </p>
              <div className="flex flex-wrap gap-2">
                {current.videos.map((v) => (
                  <button
                    key={v.src}
                    type="button"
                    onClick={() => setVideo(v)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
                  >
                    <PlayCircle className="size-4" />
                    {v.title}
                  </button>
                ))}
              </div>
            </div>
          )}

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

    {video && (
      <div
        className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
        onClick={() => setVideo(null)}
      >
        <div
          className="w-full max-w-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between gap-3 text-white">
            <p className="text-sm font-medium">{video.title}</p>
            <button
              type="button"
              onClick={() => setVideo(null)}
              aria-label="Fechar"
              className="rounded-md p-1 transition-colors hover:bg-white/10"
            >
              <X className="size-5" />
            </button>
          </div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={video.src}
            controls
            autoPlay
            className="max-h-[80vh] w-full rounded-lg bg-black"
          />
        </div>
      </div>
    )}
    </>
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

      {e.links && e.links.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {e.links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/10"
            >
              <ExternalLink className="size-3" />
              {l.label}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
