import { Pencil, Sparkles, TrendingUp } from "lucide-react"

import { getFinanceiroResumoForMonth } from "@/lib/data/ifood-imported"
import type { UnitMonthly } from "@/lib/mock-monthly"
import { fmtBRL, fmtPct } from "@/lib/format"

/**
 * Tab "Custos" do detalhe da unidade.
 *
 * Lógica:
 * - Se houver Financeiro importado pra esse mês: usa os valores do relatório
 *   (taxas, comissão, promoções) e marca como "do relatório iFood".
 * - Senão: cai pros valores manuais (monthly_platform_entries) e marca
 *   como "manual".
 *
 * "Custos da Indústria" (Cozina/Loja) é sempre manual — não vem dos
 * relatórios do iFood.
 */
export async function CustosTab({
  unitId,
  monthly,
  year,
  month,
}: {
  unitId: string
  monthly: UnitMonthly
  year: number
  month: number
}) {
  const fin = await getFinanceiroResumoForMonth(unitId, year, month)
  const useImported = fin.hasData

  // Origem dos valores
  const taxaEntrega = useImported
    ? Math.abs(fin.taxaEntrega)
    : monthly.taxaEntregaIfood
  const taxaComissao = useImported
    ? Math.abs(fin.comissaoIfood) +
      Math.abs(fin.taxaTransacao) +
      Math.abs(fin.taxaServicoCliente)
    : monthly.taxaComissaoIfood
  const servicosLogisticos = useImported ? 0 : monthly.servicosLogisticos
  const promocoes = useImported
    ? Math.abs(fin.promocaoLoja)
    : monthly.promocoes
  const outrosDescontos = useImported
    ? Math.abs(fin.pacoteAnuncios)
    : monthly.outrosDescontosIfood

  const subtotalTaxas =
    taxaEntrega + taxaComissao + servicosLogisticos + promocoes + outrosDescontos

  // Custos da indústria: sempre manual
  const subtotalCustos =
    monthly.custoProdutosCozina + (monthly.custoProdutosLoja ?? 0)

  // Resultado do mês = TODAS as plataformas (iFood + 99 + Keeta), pra bater
  // com o Hero/DRE da loja. Antes usava só fin.liquido (iFood), o que fazia
  // a margem divergir do topo da página numa loja multi-plataforma.
  // A "Taxas iFood" acima segue sendo o detalhe específico do iFood.
  const faturamentoBruto = monthly.faturamentoBruto
  const totalLiquido = monthly.totalLiquido
  const totalTaxasPlataformas = Math.max(0, faturamentoBruto - totalLiquido)
  const margemLiquida = totalLiquido - subtotalCustos
  const margemLucroPct =
    faturamentoBruto > 0 ? (margemLiquida / faturamentoBruto) * 100 : 0

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card
        title="Taxas iFood"
        tone="negative"
        badge={useImported ? "do relatório" : "manual"}
      >
        <Row label="Taxa Entrega Parceira" value={fmtBRL(taxaEntrega)} />
        <Row label="Taxa de Comissão" value={fmtBRL(taxaComissao)} />
        <Row label="Serviços Logísticos" value={fmtBRL(servicosLogisticos)} />
        <Row label="Promoções (custeadas pela loja)" value={fmtBRL(promocoes)} />
        <Row label="Pacote de anúncios" value={fmtBRL(outrosDescontos)} />
        <Divider />
        <Row
          label="Subtotal Taxas iFood"
          value={fmtBRL(subtotalTaxas)}
          bold
        />
        {useImported && fin.promocaoIfood > 0 && (
          <div className="mt-3 rounded-md bg-emerald-50 px-3 py-2 dark:bg-emerald-950/30">
            <p className="text-[11px] font-medium text-emerald-900 dark:text-emerald-300">
              + iFood bancou {fmtBRL(fin.promocaoIfood)} de promoção (não custou
              a você)
            </p>
          </div>
        )}
      </Card>

      <Card title="Custos da Indústria (manual mensal)" tone="negative">
        <div className="flex items-center justify-between gap-2 py-1.5">
          <span className="text-xs text-muted-foreground">
            Custo Produtos Cozina
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm tabular-nums">
              {fmtBRL(monthly.custoProdutosCozina)}
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
              {monthly.custoProdutosLoja !== null
                ? fmtBRL(monthly.custoProdutosLoja)
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
        <Row label="Subtotal Custos" value={fmtBRL(subtotalCustos)} bold />
      </Card>

      <Card title="Resultado do mês" className="lg:col-span-2">
        <Row
          label="Faturamento Bruto (todas plataformas)"
          value={fmtBRL(faturamentoBruto)}
          muted
        />
        <Row
          label="(−) Taxas das plataformas"
          value={`− ${fmtBRL(totalTaxasPlataformas)}`}
          muted
        />
        <Row
          label="= Total Líquido (entra na conta)"
          value={fmtBRL(totalLiquido)}
          bold
        />
        <Row
          label="(−) Total de Custos (indústria)"
          value={`− ${fmtBRL(subtotalCustos)}`}
          muted
        />
        <Divider />
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <TrendingUp
              className={`size-4 ${
                margemLiquida >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            />
            <span className="text-sm font-semibold">Margem Líquida</span>
          </div>
          <span
            className={`text-xl font-bold tabular-nums ${
              margemLiquida >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600"
            }`}
          >
            {fmtBRL(margemLiquida)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Margem de Lucro sobre Faturamento Bruto
          </span>
          <span
            className={`text-sm font-bold tabular-nums ${
              margemLucroPct >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600"
            }`}
          >
            {fmtPct(margemLucroPct)}
          </span>
        </div>
        {useImported && (
          <p className="mt-3 text-[10px] text-muted-foreground">
            Valores das taxas e do líquido vêm do <strong>Relatório de
            Conciliação</strong> do iFood (importado). Custos manuais (Cozina/Loja)
            seguem como você digitou no Mensal.
          </p>
        )}
      </Card>
    </div>
  )
}

function Card({
  title,
  children,
  className,
  tone,
  badge,
}: {
  title: string
  children: React.ReactNode
  className?: string
  tone?: "positive" | "negative"
  badge?: "do relatório" | "manual"
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
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {badge && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              badge === "do relatório"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {badge === "do relatório" && <Sparkles className="size-3" />}
            {badge}
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-col">{children}</div>
    </div>
  )
}

function Row({
  label,
  value,
  bold,
  muted,
}: {
  label: string
  value: React.ReactNode
  bold?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5">
      <span
        className={`text-xs ${muted ? "text-muted-foreground" : ""} ${
          bold ? "font-semibold" : ""
        }`}
      >
        {label}
      </span>
      <span
        className={`text-sm tabular-nums ${
          bold ? "font-semibold" : muted ? "text-muted-foreground" : ""
        }`}
      >
        {value}
      </span>
    </div>
  )
}

function Divider() {
  return <div className="my-2 h-px bg-border" />
}
