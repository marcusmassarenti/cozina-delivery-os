import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  DollarSign,
  Pencil,
  PiggyBank,
  Star,
  TrendingDown,
  TrendingUp,
} from "lucide-react"

import { BrandLogo } from "@/components/brand-logo"
import { PlatformLogo } from "@/components/platform-logo"
import { UnitMap } from "@/components/unit-map"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  getUnitByCode,
  getUnitPlatforms,
  type Unit,
} from "@/lib/data/units"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import type { UnitMonthly } from "@/lib/mock-monthly"
import { EditUnitDialog } from "../_components/edit-unit-dialog"

export default async function UnidadeDetalhePage({
  params,
}: {
  params: Promise<{ codigo: string }>
}) {
  const { codigo } = await params
  const unit = await getUnitByCode(codigo)
  if (!unit) notFound()

  const platforms = await getUnitPlatforms(unit.id)
  const m = unit.monthly
  const hasData = m.pedidos > 0

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      {/* Back link */}
      <Link
        href="/unidades"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Voltar para unidades
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <BrandLogo size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight">
                  {unit.name}
                </h1>
                <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs font-bold tabular-nums text-muted-foreground">
                  #{unit.code}
                </span>
                {!unit.active && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Inativa
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {[unit.city, unit.state].filter(Boolean).join(" · ")}
                {unit.cnpj ? ` · CNPJ ${formatCnpj(unit.cnpj)}` : ""}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="h-9 rounded-md border bg-card px-3 text-xs font-medium outline-none">
            <option>Maio/2026</option>
            <option>Abril/2026</option>
            <option>Março/2026</option>
          </select>
          <EditUnitDialog
            unit={{
              unitId: unit.id,
              code: unit.code,
              name: unit.name,
              city: unit.city,
              state: unit.state,
              cnpj: unit.cnpj,
              active: unit.active,
              platforms,
            }}
          />
        </div>
      </div>

      {hasData ? (
        <>
          <HeroKpis monthly={m} />
          <DetailTabs unit={unit} />
        </>
      ) : (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">Unidade sem dados no mês</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Conecte as plataformas ou adicione lançamentos manuais para começar
            a ver o resultado dessa loja.
          </p>
        </div>
      )}

      <UnitMap unitName={unit.name} city={unit.city} state={unit.state} />
    </div>
  )
}

//----------------------------------------------------------------
// Hero (sempre visível)
//----------------------------------------------------------------

function HeroKpis({ monthly: m }: { monthly: UnitMonthly }) {
  const heroes = [
    {
      label: "Faturamento Bruto",
      value: fmtBRL(m.faturamentoBruto),
      trend: "↗ +12% vs mês ant.",
      tone: "positive" as const,
      icon: DollarSign,
    },
    {
      label: "Margem Líquida",
      value: fmtBRL(m.margemLiquida),
      trend: "↗ +R$ 8,2k vs mês ant.",
      tone: "positive" as const,
      icon: PiggyBank,
    },
    {
      label: "Margem de Lucro",
      value: fmtPct(m.margemLucroPct),
      trend: "↗ +2,3pp vs mês ant.",
      tone: "positive" as const,
      icon: TrendingUp,
    },
    {
      label: "Nota Média",
      value: m.notaMedia > 0 ? `${m.notaMedia.toLocaleString("pt-BR")} ★` : "—",
      trend: "= vs mês ant.",
      tone: "neutral" as const,
      icon: Star,
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {heroes.map((h) => {
        const Icon = h.icon
        const toneClass =
          h.tone === "positive"
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-muted-foreground"
        return (
          <div
            key={h.label}
            className="rounded-xl border bg-card p-5 shadow-sm"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Icon className="size-4" />
            </div>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {h.label}
            </p>
            <p className="mt-1.5 text-2xl font-bold tracking-tight">
              {h.value}
            </p>
            <p className={`mt-1 text-[11px] font-medium ${toneClass}`}>
              {h.trend}
            </p>
          </div>
        )
      })}
    </div>
  )
}

//----------------------------------------------------------------
// Tabs
//----------------------------------------------------------------

function DetailTabs({ unit }: { unit: Unit }) {
  const m = unit.monthly
  return (
    <Tabs defaultValue="resumo">
      <TabsList>
        <TabsTrigger value="resumo">Resumo</TabsTrigger>
        <TabsTrigger value="receita">Receita</TabsTrigger>
        <TabsTrigger value="custos">Custos</TabsTrigger>
        <TabsTrigger value="avaliacoes">Avaliações</TabsTrigger>
      </TabsList>

      {/* Tab: Resumo */}
      <TabsContent value="resumo" className="mt-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Volume do mês">
            <Row label="Pedidos Recebidos" value={fmtNum(m.pedidos)} />
            <Row
              label="Pedidos Cancelados"
              value={`${fmtNum(m.pedidosCancelados)} (${fmtPct((m.pedidosCancelados / m.pedidos) * 100)})`}
            />
            <Row label="Ticket Médio" value={fmtBRL(m.ticketMedio)} />
            <Row
              label="Clientes Novos"
              value={m.clientesNovos !== null ? fmtNum(m.clientesNovos) : "—"}
            />
          </Card>
          <Card title="Plataformas (mês)">
            {m.platforms.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2">
                <PlatformLogo platform={p.id} size="sm" />
                <div className="flex flex-1 items-baseline justify-between">
                  <span className="text-sm">{p.name}</span>
                  <span className="text-sm font-semibold tabular-nums">
                    {fmtBRL(p.bruto)}
                  </span>
                </div>
              </div>
            ))}
          </Card>
          <Card title="Observações" className="lg:col-span-2">
            <textarea
              defaultValue={m.observacoes}
              placeholder="Anotações do mês — comentários, alertas, contexto..."
              className="min-h-24 w-full resize-y rounded-md border bg-background p-3 text-sm outline-none focus:border-ring"
            />
            <button
              type="button"
              className="mt-2 inline-flex h-8 items-center gap-1.5 self-end rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              Salvar observações
            </button>
          </Card>
        </div>
      </TabsContent>

      {/* Tab: Receita */}
      <TabsContent value="receita" className="mt-4">
        <Card title="Receita (mês)" tone="positive">
          <Row
            label="Faturamento Bruto"
            value={fmtBRL(m.faturamentoBruto)}
            bold
          />
          <Row
            label="(−) Total de descontos e taxas"
            value={`− ${fmtBRL(
              m.taxaEntregaIfood +
                m.promocoes +
                m.taxaComissaoIfood +
                m.servicosLogisticos +
                m.outrosDescontosIfood,
            )}`}
            muted
          />
          <Row
            label="= Faturamento Líquido"
            value={fmtBRL(m.faturamentoLiquido)}
            bold
            highlight
          />
          <Divider />
          <Row label="(+) VR Recebido via loja" value={fmtBRL(m.vrRecebido)} />
          <Row
            label="(−) VR Taxa Média 8%"
            value={`− ${fmtBRL(m.vrTaxaMedia8)}`}
            muted
          />
          <Row
            label="(−) Cancelamentos/Reembolsos"
            value={`− ${fmtBRL(m.cancelamentosReembolsos)}`}
            muted
          />
          <Divider />
          <Row
            label="= Total Líquido (entra na conta)"
            value={fmtBRL(m.totalLiquido)}
            bold
            highlight
          />
        </Card>
      </TabsContent>

      {/* Tab: Custos */}
      <TabsContent value="custos" className="mt-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Taxas iFood (vindas da API)" tone="negative">
            <Row label="Taxa Entrega Parceira" value={fmtBRL(m.taxaEntregaIfood)} />
            <Row label="Taxa de Comissão" value={fmtBRL(m.taxaComissaoIfood)} />
            <Row label="Serviços Logísticos" value={fmtBRL(m.servicosLogisticos)} />
            <Row label="Promoções" value={fmtBRL(m.promocoes)} />
            <Row label="Outros Descontos" value={fmtBRL(m.outrosDescontosIfood)} />
            <Divider />
            <Row
              label="Subtotal Taxas iFood"
              value={fmtBRL(
                m.taxaEntregaIfood +
                  m.promocoes +
                  m.taxaComissaoIfood +
                  m.servicosLogisticos +
                  m.outrosDescontosIfood,
              )}
              bold
            />
          </Card>

          <Card title="Custos da Indústria (manual mensal)" tone="negative">
            <div className="flex items-center justify-between gap-2 py-1.5">
              <span className="text-xs text-muted-foreground">
                Custo Produtos Cozina
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm tabular-nums">
                  {fmtBRL(m.custoProdutosCozina)}
                </span>
                <button
                  type="button"
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Editar compras Cozina"
                >
                  <Pencil className="size-3" />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 py-1.5">
              <span className="text-xs text-muted-foreground">
                Custo Produtos Loja
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm tabular-nums text-muted-foreground">
                  {m.custoProdutosLoja !== null
                    ? fmtBRL(m.custoProdutosLoja)
                    : "—"}
                </span>
                <button
                  type="button"
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Editar custos da loja"
                >
                  <Pencil className="size-3" />
                </button>
              </div>
            </div>
            <Divider />
            <Row
              label="Subtotal Custos"
              value={fmtBRL(m.custoProdutosCozina + (m.custoProdutosLoja ?? 0))}
              bold
            />
          </Card>

          <Card title="Resultado do mês" className="lg:col-span-2">
            <Row
              label="Total Líquido (entra na conta)"
              value={fmtBRL(m.totalLiquido)}
              muted
            />
            <Row
              label="Total de Custos"
              value={`− ${fmtBRL(m.custoProdutosCozina + (m.custoProdutosLoja ?? 0))}`}
              muted
            />
            <Divider />
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-semibold">Margem Líquida</span>
              </div>
              <span className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {fmtBRL(m.margemLiquida)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Margem de Lucro sobre Faturamento Bruto
              </span>
              <span className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {fmtPct(m.margemLucroPct)}
              </span>
            </div>
          </Card>
        </div>
      </TabsContent>

      {/* Tab: Avaliações */}
      <TabsContent value="avaliacoes" className="mt-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Nota Média">
            <div className="flex items-baseline gap-2 py-2">
              <span className="text-4xl font-bold tabular-nums">
                {m.notaMedia.toLocaleString("pt-BR")}
              </span>
              <Star className="size-5 fill-amber-400 stroke-amber-400" />
            </div>
            <p className="text-xs text-muted-foreground">
              ≈ 0,1 acima da média da rede (4,7)
            </p>
          </Card>
          <Card title="Volume" className="lg:col-span-2">
            <Row label="Avaliações no mês" value="API iFood (em breve)" muted />
            <Row label="5 estrelas" value="—" muted />
            <Row label="4 estrelas" value="—" muted />
            <Row label="3 estrelas" value="—" muted />
            <Row label="2 estrelas" value="—" muted />
            <Row label="1 estrela" value="—" muted />
          </Card>
          <Card title="Últimos comentários" className="lg:col-span-3">
            <div className="flex h-32 items-center justify-center text-center text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <TrendingDown className="size-4" />
                <span>Conecte a API do iFood para ver comentários reais.</span>
              </div>
            </div>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  )
}

//----------------------------------------------------------------
// Reusable inner pieces
//----------------------------------------------------------------

function Card({
  title,
  children,
  className,
  tone,
}: {
  title: string
  children: React.ReactNode
  className?: string
  tone?: "positive" | "negative"
}) {
  const accent =
    tone === "positive"
      ? "border-l-4 border-l-emerald-500"
      : tone === "negative"
        ? "border-l-4 border-l-rose-500"
        : ""
  return (
    <div
      className={`rounded-xl border bg-card p-5 shadow-sm ${accent} ${className ?? ""}`}
    >
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="mt-3 flex flex-col">{children}</div>
    </div>
  )
}

function Row({
  label,
  value,
  bold,
  muted,
  highlight,
}: {
  label: string
  value: React.ReactNode
  bold?: boolean
  muted?: boolean
  highlight?: boolean
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-2 py-1.5 ${
        highlight ? "rounded-md bg-emerald-50 px-2 dark:bg-emerald-950/30" : ""
      }`}
    >
      <span
        className={`text-xs ${muted ? "text-muted-foreground" : ""} ${bold ? "font-semibold" : ""}`}
      >
        {label}
      </span>
      <span
        className={`text-sm tabular-nums ${
          highlight
            ? "font-bold text-emerald-700 dark:text-emerald-400"
            : bold
              ? "font-semibold"
              : ""
        } ${muted ? "text-muted-foreground" : ""}`}
      >
        {value}
      </span>
    </div>
  )
}

function Divider() {
  return <div className="my-2 h-px bg-border" />
}

function formatCnpj(c: string): string {
  const d = c.replace(/\D/g, "")
  if (d.length !== 14) return c
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
}
