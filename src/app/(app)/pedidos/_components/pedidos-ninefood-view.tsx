import Link from "next/link"
import {
  Bike,
  ChevronRight,
  CreditCard,
  Receipt,
  Tag,
  UserPlus,
  XCircle,
} from "lucide-react"

import type {
  NinefoodPedidoResumo,
  NinefoodPedidoUnitRow,
} from "@/lib/data/ninefood-pedidos"
import { fmtBRL, fmtBRLShort, fmtNum, fmtPct } from "@/lib/format"

/** Segundos → "X s" (curto) ou "Y,Z min" (a partir de 90s). */
function fmtSeg(s: number): string {
  if (s <= 0) return "—"
  return s >= 90 ? `${(s / 60).toFixed(1)} min` : `${Math.round(s)} s`
}

/**
 * Corpo da tela de Pedidos quando a plataforma é 99 Food. O 99 não tem VR por
 * bandeira (pagamento costuma ser online); o foco é receita/repasse, taxas
 * granulares, cliente novo×recorrente, qualidade (nota/tempos) e promoção.
 */
export function PedidosNinefoodView({
  resumo,
  porLoja,
  periodoParam,
}: {
  resumo: NinefoodPedidoResumo
  porLoja?: NinefoodPedidoUnitRow[]
  periodoParam?: string
}) {
  const r = resumo
  const unitHref = (code: string) =>
    `/unidades/${code}${periodoParam ? `?periodo=${periodoParam}` : ""}`

  if (!r.hasData) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-10 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
          <Receipt className="size-6 text-muted-foreground" />
        </div>
        <p className="mt-4 text-sm font-medium">
          Sem &quot;Dados do pedido&quot; do 99 Food neste mês
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Sobe o relatório &quot;Dados do pedido&quot; do 99 Food (um por loja)
          em{" "}
          <a href="/importacao" className="underline">
            /importacao
          </a>
          .
        </p>
      </div>
    )
  }

  const repassePct =
    r.receitaVendas > 0 ? (r.receitaRealLoja / r.receitaVendas) * 100 : 0
  const totalClientes = r.clientesNovos + r.clientesRecorrentes

  return (
    <>
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={<Receipt className="size-4" />}
          label="Pedidos"
          value={fmtNum(r.totalPedidos)}
          hint={`${fmtBRLShort(r.receitaVendas)} em vendas`}
        />
        <Kpi
          icon={<Tag className="size-4" />}
          label="Ticket médio"
          value={fmtBRL(r.ticketMedio)}
          hint={`${fmtNum(r.concluidos)} concluídos`}
        />
        <Kpi
          icon={<UserPlus className="size-4" />}
          label="Clientes novos"
          value={
            totalClientes > 0
              ? fmtPct((r.clientesNovos / totalClientes) * 100)
              : "—"
          }
          hint={`${fmtNum(r.clientesNovos)} de ${fmtNum(totalClientes)}`}
          tone="novo"
        />
        <Kpi
          icon={<XCircle className="size-4" />}
          label="Cancelados"
          value={fmtNum(r.cancelados)}
          hint={
            r.totalPedidos > 0
              ? `${fmtPct((r.cancelados / r.totalPedidos) * 100)} dos pedidos`
              : "—"
          }
          tone={r.cancelados > 0 ? "rose" : undefined}
        />
      </div>

      {/* Receita/repasse + Taxas */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold">Receita & repasse</h3>
          <div className="space-y-1.5">
            <LinhaInfo label="Receita de vendas (bruto)" value={fmtBRL(r.receitaVendas)} />
            <LinhaInfo
              label="Receita real da loja (líquido)"
              value={fmtBRL(r.receitaRealLoja)}
              tone="emerald"
            />
            <LinhaInfo label="Repasse" value={fmtPct(repassePct)} />
            {r.precoOriginal > 0 && (
              <LinhaInfo
                label="Desconto médio (vs tabela)"
                value={fmtPct(r.descontoPct)}
                tone={r.descontoPct > 0 ? "rose" : undefined}
              />
            )}
            <LinhaInfo
              label="Promoção custeada pela loja"
              value={fmtBRL(r.promoLoja)}
              tone={r.promoLoja > 0 ? "rose" : undefined}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            A promoção da loja é custo seu (oferta bancada pela unidade). Desconto
            médio = quanto a venda fica abaixo do preço de tabela.
          </p>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Receipt className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Taxas do 99 Food</h3>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {fmtBRL(r.taxasTotal)} no total
            </span>
          </div>
          <div className="space-y-1.5">
            <LinhaInfo label="Comissão" value={fmtBRL(r.comissao)} tone="rose" />
            <LinhaInfo
              label="Taxa de canal de pagamento"
              value={fmtBRL(r.taxaCanalPagamento)}
            />
            <LinhaInfo
              label="Custos logísticos"
              value={fmtBRL(r.custosLogisticos)}
            />
            {r.custoFreteGratis > 0 && (
              <LinhaInfo
                label="Frete grátis (loja)"
                value={fmtBRL(r.custoFreteGratis)}
              />
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Soma por pedido. O repasse oficial vem da Loja diária (Resultado).
          </p>
        </div>
      </div>

      {/* Clientes + Pagamento + Método de entrega */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <UserPlus className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Clientes</h3>
          </div>
          {totalClientes === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">—</p>
          ) : (
            <div className="space-y-1.5">
              <Barrinha label="Novos" pedidos={r.clientesNovos} total={totalClientes} />
              <Barrinha
                label="Recorrentes"
                pedidos={r.clientesRecorrentes}
                total={totalClientes}
              />
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <CreditCard className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Forma de pagamento</h3>
          </div>
          <div className="space-y-1.5">
            {r.formaPagamento.slice(0, 5).map((m) => (
              <Barrinha
                key={m.forma}
                label={m.forma}
                pedidos={m.pedidos}
                total={r.totalPedidos}
              />
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Bike className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Método de entrega</h3>
          </div>
          {r.metodoEntrega.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">—</p>
          ) : (
            <div className="space-y-1.5">
              {r.metodoEntrega.slice(0, 5).map((m) => (
                <Barrinha
                  key={m.label}
                  label={m.label}
                  pedidos={m.pedidos}
                  total={r.totalPedidos}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Qualidade & tempos + Cancelamento */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold">Qualidade & tempos</h3>
          <div className="space-y-1.5">
            <LinhaInfo
              label="Nota média"
              value={
                r.avaliados > 0
                  ? `${r.notaMedia.toFixed(2)} ★ (${fmtNum(r.avaliados)})`
                  : "—"
              }
            />
            <LinhaInfo
              label="Preparação atrasada"
              value={fmtPct(r.preparacaoAtrasadaPct)}
              tone={r.preparacaoAtrasadaPct > 10 ? "rose" : undefined}
            />
            <LinhaInfo
              label="Tempo de aceitação"
              value={fmtSeg(r.tempoAceitacaoMedioSeg)}
            />
            <LinhaInfo
              label="Tempo de preparo"
              value={
                r.tempoPreparoMedioMin > 0
                  ? `${r.tempoPreparoMedioMin.toFixed(1)} min`
                  : "—"
              }
            />
            <LinhaInfo
              label="Espera do entregador"
              value={fmtSeg(r.tempoEsperaRetiradaMedioSeg)}
            />
            <LinhaInfo
              label="Duração da entrega"
              value={
                r.duracaoEntregaMediaMin > 0
                  ? `${r.duracaoEntregaMediaMin.toFixed(1)} min`
                  : "—"
              }
            />
            {/* A perna da RUA, separada do pedido inteiro. É o que distingue
                "a cozinha demorou" de "a entrega demorou" — a linha acima
                soma aceite, preparo e rota, e some essa diferença. */}
            <LinhaInfo
              label="Entregador → cliente"
              value={
                r.tempoEntregadorClienteMedioMin > 0
                  ? `${r.tempoEntregadorClienteMedioMin.toFixed(1)} min`
                  : "—"
              }
            />
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <XCircle className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Cancelamento</h3>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {fmtNum(r.cancelados)}
              {r.totalPedidos > 0 &&
                ` · ${fmtPct((r.cancelados / r.totalPedidos) * 100)}`}
            </span>
          </div>
          {r.cancelados === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Nenhum cancelamento no período
            </p>
          ) : (
            <div className="space-y-3">
              {r.cancelPorResponsavel.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Por responsável
                  </p>
                  <div className="space-y-1.5">
                    {r.cancelPorResponsavel.slice(0, 4).map((m) => (
                      <Barrinha
                        key={m.label}
                        label={m.label}
                        pedidos={m.pedidos}
                        total={r.cancelados}
                      />
                    ))}
                  </div>
                </div>
              )}
              {r.cancelMotivos.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Principais motivos (comerciante)
                  </p>
                  <div className="space-y-1.5">
                    {r.cancelMotivos.slice(0, 4).map((m) => (
                      <Barrinha
                        key={m.label}
                        label={m.label}
                        pedidos={m.pedidos}
                        total={r.cancelados}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Valor vendido por loja (só no consolidado) */}
      {porLoja && porLoja.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <h3 className="text-sm font-semibold">
              Valor vendido por loja{" "}
              <span className="font-normal text-muted-foreground">
                ({porLoja.length})
              </span>
            </h3>
            <span className="text-[10px] text-muted-foreground">
              faturamento · líquido e promo embaixo
            </span>
          </div>
          <div className="divide-y">
            {porLoja.map((u) => (
              <Link
                key={u.unitId}
                href={unitHref(u.unitCode)}
                className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/50"
              >
                <span className="inline-flex shrink-0 items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                  #{u.unitCode}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{u.unitName}</p>
                  <p className="text-[10px] tabular-nums text-muted-foreground">
                    líquido {fmtBRLShort(u.receitaRealLoja)} · promo{" "}
                    {fmtBRLShort(u.promoLoja)}
                    {u.cancelados > 0 && ` · ${fmtNum(u.cancelados)} canc.`}
                  </p>
                </div>
                <div className="w-28 shrink-0 text-right">
                  <p className="text-sm font-bold tabular-nums">
                    {u.faturamento > 0 ? fmtBRL(u.faturamento) : "—"}
                  </p>
                  <p className="text-[10px] tabular-nums text-muted-foreground">
                    {fmtNum(u.pedidos)} pedidos
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Fonte: relatório &quot;Dados do pedido&quot; do 99 Food. O{" "}
        <strong>valor vendido</strong> é o faturamento (Loja diária); o 99 não
        reporta VR por bandeira.
      </p>
    </>
  )
}

function Kpi({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  tone?: "novo" | "rose"
}) {
  const box =
    tone === "novo"
      ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
      : tone === "rose"
        ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
        : "bg-accent text-accent-foreground"
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${box}`}>
        {icon}
      </div>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function LinhaInfo({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "emerald" | "rose"
}) {
  const color =
    tone === "emerald"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "rose"
        ? "text-rose-700 dark:text-rose-400"
        : "text-foreground"
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${color}`}>
        {value}
      </span>
    </div>
  )
}

function Barrinha({
  label,
  pedidos,
  total,
}: {
  label: string
  pedidos: number
  total: number
}) {
  const pct = total > 0 ? (pedidos / total) * 100 : 0
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 truncate text-xs" title={label}>
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-emerald-500"
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
      <span className="w-16 text-right text-xs tabular-nums">
        <span className="font-semibold">{fmtNum(pedidos)}</span>
        <span className="ml-1 text-[10px] text-muted-foreground">
          ({pct.toFixed(0)}%)
        </span>
      </span>
    </div>
  )
}
