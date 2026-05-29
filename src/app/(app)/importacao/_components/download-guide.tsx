"use client"

import * as React from "react"
import {
  BookOpen,
  Calendar,
  ChevronDown,
  FileSpreadsheet,
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
  path: string[]
  cadence: string
  download: string
  feeds: string[]
}

const IFOOD_ENTRIES: GuideEntry[] = [
  {
    icon: UtensilsCrossed,
    title: "Cardápio",
    badge: "Diário ou Mensal",
    badgeTone: "blue",
    path: ["iFood Gestor de Pedidos", "Operação", "Cardápio"],
    cadence:
      "Diário: 1 arquivo por dia, com período = 1 dia (ex.: 27/05 - 27/05). Mensal: 1 arquivo da rede inteira com período do mês (ex.: 01/05 - 31/05).",
    download:
      "Após escolher período e loja, clique em \"Exportar dados\" → seleciona XLSX. Sobe direto em /importacao.",
    feeds: [
      "Funil de conversão (Visitas → Pedidos)",
      "Top itens vendidos",
      "Top complementos mais escolhidos",
    ],
  },
  {
    icon: Receipt,
    title: "Conciliação / Repasse Financeiro",
    badge: "Mensal",
    badgeTone: "amber",
    path: ["iFood Gestor", "Financeiro", "Conciliação"],
    cadence:
      "1 arquivo por loja, no início do mês seguinte (depois que o iFood fechou a apuração). Cada arquivo cobre 1 competência (ex.: 2026-05).",
    download:
      "Filtra a loja → escolhe a competência → \"Baixar relatório completo\" (XLSX). Repete pra cada loja da rede.",
    feeds: [
      "Faturamento bruto, líquido e taxa de repasse no Dashboard",
      "Quebra de taxas (comissão, entrega, transação)",
      "Cancelamentos com motivo + perda financeira",
      "Auto-preenchimento da aba Mensal (taxas iFood)",
    ],
  },
  {
    icon: Star,
    title: "Avaliações (comentários)",
    badge: "Semanal ou Mensal",
    badgeTone: "emerald",
    path: ["iFood Gestor", "Operação", "Avaliações"],
    cadence:
      "1 arquivo da rede inteira por período (semana ou mês). Já vem com todas as lojas misturadas — sistema separa automaticamente.",
    download:
      "Em \"Comentários e avaliações\" → escolhe período → \"Exportar\" (XLSX). 1 arquivo cobre todas as 10 lojas.",
    feeds: [
      "Nota média e distribuição de estrelas",
      "Top elogios e top reclamações (tags)",
      "Comentários reais dos clientes (com link pro pedido)",
    ],
  },
  {
    icon: Ticket,
    title: "Pedidos (formas de pagamento / VR)",
    badge: "Mensal",
    badgeTone: "amber",
    path: ["iFood Gestor", "Financeiro", "Pedidos"],
    cadence:
      "1 arquivo por loja, escolhendo o período (ex.: 01/05 - 31/05). Cada pedido vem com a forma de pagamento e o valor.",
    download:
      "Em \"Relatório de pedidos\" → escolhe a loja e o período → \"Exportar\" (XLSX). Repete pra cada loja.",
    feeds: [
      "Vale-Refeição por bandeira (Sodexo/Alelo/Ticket/VR/iFood) — tela Pedidos",
      "Mix de formas de pagamento (Crédito/PIX/Carteira/VR)",
      "VR consolidado no Resultado e no detalhe da loja",
    ],
  },
]

const NINEFOOD_ENTRIES: GuideEntry[] = [
  {
    icon: Receipt,
    title: "Dados da loja (Financeiro)",
    badge: "Diário (agregado)",
    badgeTone: "amber",
    path: ["99 Food Merchant", "Baixar dados", "Dados da loja"],
    cadence:
      "1 arquivo por período. Cada linha é 1 loja × 1 dia (agregado). Pode marcar várias lojas e período largo — o sistema separa por unidade automaticamente.",
    download:
      "Em \"Configuração do relatório\" → marca \"Dados da loja\" → escolhe lojas + datas + métricas (Total de vendas, Receita total de vendas, Receita total, Despesas de comissão, Taxa de canal de pagamento, Avaliação da loja, TA, Cancelamentos, Tempo médio de preparo).",
    feeds: [
      "Faturamento bruto e líquido no Dashboard",
      "Taxa de comissão e taxa de canal pagamento",
      "Avaliação média, Taxa de Aceitação e tempo de preparo",
    ],
  },
  {
    icon: UtensilsCrossed,
    title: "Dados do item (Cardápio)",
    badge: "Diário",
    badgeTone: "blue",
    path: ["99 Food Merchant", "Baixar dados", "Dados do item"],
    cadence:
      "1 arquivo por período. 1 linha = 1 loja × 1 dia × 1 item. Mostra receita e qtd vendida por produto.",
    download:
      "Marca \"Dados do item\" → lojas + datas. Métricas vêm padrão (Receita do item, Volume, Média de preço, Alcance, Conversão).",
    feeds: [
      "Top itens vendidos por loja",
      "Funil de adição ao carrinho por produto",
      "Comparação de preço médio do item entre lojas",
    ],
  },
  {
    icon: Star,
    title: "Dados do pedido (Avaliações)",
    badge: "Por período",
    badgeTone: "emerald",
    path: ["99 Food Merchant", "Baixar dados", "Dados do pedido"],
    cadence:
      "1 arquivo por período. 1 linha = 1 pedido. Inclui avaliações com comentário + tags + dados do cliente (novo vs recorrente).",
    download:
      "Marca \"Dados do pedido\" → lojas + período. Marca \"Nível de avaliação do cliente\", \"Conteúdo de avaliação\", \"Tag de avaliação\", \"Quantidade de pedidos anteriores do cliente\".",
    feeds: [
      "Distribuição de notas e nota média",
      "Top elogios e top reclamações (tags)",
      "Comentários reais dos clientes",
      "% de clientes novos vs recorrentes",
    ],
  },
]

const KEETA_ENTRIES: GuideEntry[] = [
  {
    icon: Receipt,
    title: "Dados do restaurante (Loja diária)",
    badge: "Diário (agregado)",
    badgeTone: "amber",
    path: ["Keeta Merchant", "Relatórios", "Configuração de dados"],
    cadence:
      "1 arquivo por período. Cada linha é 1 loja × 1 dia (agregado): vendas, pedidos, cancelados, funil e tempo de preparo.",
    download:
      'Aba "Configuração de dados" → chip "Dados do restaurante" → "Selecionar todos os restaurantes" → escolhe o período → "Selecionar todos os dados". Depois vai na aba "Downloads" e baixa o XLSX gerado.',
    feeds: [
      "Faturamento bruto e pedidos no Dashboard e Relatório Diário",
      "Pedidos cancelados por dia",
      "Funil (visitantes → carrinho → conversão)",
    ],
  },
  {
    icon: Star,
    title: "Dados do pedido (Pedidos)",
    badge: "Por período",
    badgeTone: "emerald",
    path: ["Keeta Merchant", "Relatórios", "Configuração de dados"],
    cadence:
      "1 arquivo por período. 1 linha = 1 pedido. Traz o financeiro (ganhos líquidos, comissão, taxa de entrega), o cancelamento e a avaliação juntos.",
    download:
      'Chip "Dados do pedido" → "Selecionar todos os restaurantes" → período → "Selecionar todos os dados" → baixa em "Downloads".',
    feeds: [
      "Faturamento líquido (ganhos líquidos)",
      "Motivos de cancelamento",
      "Notas e comentários dos clientes",
    ],
  },
  {
    icon: UtensilsCrossed,
    title: "Dados do item (Itens)",
    badge: "Diário",
    badgeTone: "blue",
    path: ["Keeta Merchant", "Relatórios", "Configuração de dados"],
    cadence:
      "1 arquivo por período. 1 linha = 1 loja × 1 dia × 1 item. Qtd vendida, preço médio e alcance por produto.",
    download:
      'Chip "Dados do item" → "Selecionar todos os restaurantes" → período → "Selecionar todos os dados" → baixa em "Downloads".',
    feeds: [
      "Top produtos vendidos por loja",
      "Preço médio e alcance por item",
    ],
  },
]

const toneClass: Record<GuideEntry["badgeTone"], string> = {
  amber:
    "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400",
  emerald:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
}

export function DownloadGuide() {
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
              iFood (4), 99 Food (3) e Keeta (3 relatórios). Clica pra
              expandir.
            </p>
          </div>
        </div>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[panel-open]/guide:rotate-180" />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="space-y-5 border-t p-4">
          <PlatformSection
            platform="ifood"
            label="iFood"
            entries={IFOOD_ENTRIES}
          />
          <PlatformSection
            platform="99food"
            label="99 Food"
            entries={NINEFOOD_ENTRIES}
          />
          <PlatformSection
            platform="keeta"
            label="Keeta"
            entries={KEETA_ENTRIES}
          />
        </div>

        <div className="border-t bg-muted/30 px-5 py-3">
          <p className="text-[11px] text-muted-foreground">
            <strong className="text-foreground">Dica:</strong> Pode arrastar
            vários XLSX (de qualquer plataforma) ao mesmo tempo na zona de
            upload abaixo. O sistema identifica plataforma, tipo de relatório
            e loja automaticamente — basta esperar processar.
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function PlatformSection({
  platform,
  label,
  entries,
}: {
  platform: PlatformId
  label: string
  entries: GuideEntry[]
}) {
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        <PlatformLogo platform={platform} size="sm" />
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {entries.length} relatório{entries.length > 1 ? "s" : ""}
        </span>
      </div>
      <div
        className={`grid gap-3 ${
          entries.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2"
        }`}
      >
        {entries.map((e) => (
          <EntryCard key={e.title} entry={e} />
        ))}
      </div>
    </div>
  )
}

function EntryCard({ entry: e }: { entry: GuideEntry }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border bg-background p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex size-8 items-center justify-center rounded-md bg-muted">
          <e.icon className="size-4 text-foreground" />
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneClass[e.badgeTone]}`}
        >
          <Calendar className="size-2.5" />
          {e.badge}
        </span>
      </div>

      <div>
        <p className="text-sm font-bold">{e.title}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">Onde achar: </span>
          {e.path.join(" → ")}
        </p>
      </div>

      <div className="space-y-2 text-[11px] leading-relaxed">
        <div>
          <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
            Cadência
          </p>
          <p className="mt-0.5">{e.cadence}</p>
        </div>
        <div>
          <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
            Como baixar
          </p>
          <p className="mt-0.5">{e.download}</p>
        </div>
        <div>
          <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
            Alimenta no sistema
          </p>
          <ul className="mt-1 space-y-0.5">
            {e.feeds.map((f) => (
              <li key={f} className="flex items-start gap-1.5">
                <FileSpreadsheet className="mt-0.5 size-2.5 shrink-0 text-emerald-600" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
