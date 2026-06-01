import Link from "next/link"
import {
  ArrowRight,
  BarChart3,
  Ban,
  Bike,
  GitCompareArrows,
  Layers,
  LayoutGrid,
  LineChart,
  type LucideIcon,
  MessageSquare,
  Package,
  Receipt,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Wallet,
} from "lucide-react"

import { assertCanView } from "@/lib/auth/permissions"

type ReportItem = {
  title: string
  desc: string
  icon: LucideIcon
  href?: string
  soon?: boolean
}

type Categoria = {
  label: string
  icon: LucideIcon
  reports: ReportItem[]
}

const CATEGORIAS: Categoria[] = [
  {
    label: "Faturamento & Resultado",
    icon: TrendingUp,
    reports: [
      {
        title: "Comparativo loja × loja",
        desc: "Compara lojas lado a lado nos indicadores que você escolher, com crescimento entre meses.",
        icon: GitCompareArrows,
        href: "/relatorios/comparativo",
      },
      {
        title: "Resultado da rede",
        desc: "Consolidado da rede no mês — KPIs e DRE em cascata, do bruto ao resultado operacional.",
        icon: Wallet,
        href: "/relatorios/resultado",
      },
      {
        title: "Infos Diária Venda (metas)",
        desc: "Venda diária por loja × plataforma, total do mês, meta e falta — agrupado por marca, pronto pra imprimir.",
        icon: Target,
        href: "/relatorios/acompanhamento",
      },
      {
        title: "Evolução / crescimento",
        desc: "Linha do tempo dos indicadores, com Δ% mês a mês e crescimento do período.",
        icon: LineChart,
        href: "/relatorios/evolucao",
      },
      {
        title: "Ranking de lojas",
        desc: "Lojas ordenadas por faturamento, ticket ou margem no período.",
        icon: Trophy,
        href: "/relatorios/ranking",
      },
      {
        title: "Faturamento por plataforma",
        desc: "Quanto cada plataforma representa do faturamento da rede.",
        icon: Layers,
        soon: true,
      },
    ],
  },
  {
    label: "Produtos",
    icon: Package,
    reports: [
      {
        title: "Top produtos",
        desc: "Itens mais vendidos por plataforma, na rede ou por loja, por qtd ou faturamento.",
        icon: Package,
        href: "/relatorios/produtos",
      },
      {
        title: "Produtos em alta / queda",
        desc: "O que subiu ou caiu vs outro mês — compara dois meses por produto.",
        icon: TrendingUp,
        href: "/relatorios/produtos",
      },
      {
        title: "Comparativo de produtos",
        desc: "Mesmo produto entre lojas diferentes.",
        icon: GitCompareArrows,
        soon: true,
      },
    ],
  },
  {
    label: "Avaliações",
    icon: Star,
    reports: [
      {
        title: "Evolução da nota",
        desc: "Crescimento ou queda da nota média ao longo dos meses.",
        icon: LineChart,
        soon: true,
      },
      {
        title: "Comparativo de nota",
        desc: "Nota média loja × loja, por plataforma.",
        icon: GitCompareArrows,
        soon: true,
      },
      {
        title: "Comentários negativos",
        desc: "Avaliações ruins por loja, pra agir rápido.",
        icon: MessageSquare,
        soon: true,
      },
    ],
  },
  {
    label: "Operação",
    icon: BarChart3,
    reports: [
      {
        title: "Cancelamentos",
        desc: "Pedidos cancelados por loja e plataforma.",
        icon: Ban,
        soon: true,
      },
      {
        title: "Ticket médio comparativo",
        desc: "Ticket médio entre lojas e plataformas.",
        icon: Receipt,
        soon: true,
      },
      {
        title: "Cobertura de importação",
        desc: "O que cada loja já tem importado, mês a mês.",
        icon: LayoutGrid,
        href: "/importacao/cobertura",
      },
    ],
  },
]

export default async function RelatoriosHubPage() {
  await assertCanView("relatorios")
  return (
    <div className="flex flex-1 flex-col gap-7 bg-muted/30 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hub de Relatórios
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Relatórios da rede por categoria. Escolha lojas, plataformas e período
          dentro de cada um.
        </p>
      </div>

      {CATEGORIAS.map((cat) => {
        const CatIcon = cat.icon
        return (
          <section key={cat.label} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <CatIcon className="size-4 text-muted-foreground" />
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {cat.label}
              </h2>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cat.reports.map((r) => (
                <ReportCard key={r.title} report={r} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function ReportCard({ report }: { report: ReportItem }) {
  const Icon = report.icon
  const inner = (
    <>
      <div
        className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
          report.soon
            ? "bg-muted text-muted-foreground"
            : "bg-accent text-accent-foreground"
        }`}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          {report.title}
          {report.soon ? (
            <span className="rounded-full bg-muted-foreground/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              em breve
            </span>
          ) : (
            <ArrowRight className="size-3.5 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{report.desc}</p>
      </div>
    </>
  )

  if (report.soon || !report.href) {
    return (
      <div className="flex cursor-not-allowed items-start gap-3 rounded-xl border border-dashed bg-card/60 p-4 opacity-70">
        {inner}
      </div>
    )
  }

  return (
    <Link
      href={report.href}
      className="group flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      {inner}
    </Link>
  )
}
