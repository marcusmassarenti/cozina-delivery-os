import Link from "next/link"
import { ChevronRight, CreditCard, Receipt, Ticket, Wallet } from "lucide-react"

import type { PagamentoResumo, VrPorUnidade } from "@/lib/data/ifood-pedidos"
import { fmtBRL, fmtBRLShort, fmtNum, fmtPct } from "@/lib/format"

/**
 * Corpo da tela de Pedidos quando a plataforma é iFood. Foco: forma de
 * pagamento e VR por bandeira (Sodexo/Alelo/Ticket/VR/iFood).
 */
export function PedidosIfoodView({
  resumo,
  vrByUnit,
  selectedUnit,
  activeUnitsCount,
  periodoParam,
}: {
  resumo: PagamentoResumo
  vrByUnit: VrPorUnidade[]
  selectedUnit: { code: string; name: string } | null
  activeUnitsCount: number
  periodoParam?: string
}) {
  const dataCodes = new Set(vrByUnit.map((u) => u.unitCode))
  const showVrByUnit = !selectedUnit && vrByUnit.length > 0
  const unitHref = (code: string) =>
    `/unidades/${code}${periodoParam ? `?periodo=${periodoParam}` : ""}`

  return (
    <>
      {/* Cobertura — deixa claro que o "geral" só cobre as lojas importadas */}
      {!selectedUnit && dataCodes.size > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
          <span className="font-semibold">
            Consolidado de {dataCodes.size} de {activeUnitsCount} lojas
          </span>
          <span>· com Relatório de Pedidos importado:</span>
          <span className="font-medium">
            {vrByUnit.map((u) => `#${u.unitCode}`).join(", ")}
          </span>
          <span>· as demais ainda não foram importadas.</span>
        </div>
      )}

      {!resumo.hasData ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
            <Receipt className="size-6 text-muted-foreground" />
          </div>
          <p className="mt-4 text-sm font-medium">
            Sem pedidos importados neste mês
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sobe o &quot;Relatório de pedidos&quot; do iFood (um por loja) em{" "}
            <a href="/importacao" className="underline">
              /importacao
            </a>{" "}
            pra ver o VR por bandeira e o mix de pagamento.
          </p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              icon={<Receipt className="size-4" />}
              label="Pedidos"
              value={fmtNum(resumo.totalPedidos)}
              hint={`${fmtBRLShort(resumo.totalValor)} pagos pelos clientes`}
            />
            <Kpi
              icon={<Ticket className="size-4" />}
              label="Pedidos em VR"
              value={fmtNum(resumo.vrPedidos)}
              hint={`${fmtPct((resumo.vrPedidos / resumo.totalPedidos) * 100)} dos pedidos`}
              tone="vr"
            />
            <Kpi
              icon={<Wallet className="size-4" />}
              label="Valor em VR"
              value={fmtBRLShort(resumo.vrValor)}
              hint={`${fmtPct(resumo.vrPct)} do valor pago`}
              tone="vr"
            />
            <Kpi
              icon={<CreditCard className="size-4" />}
              label="Bandeiras de VR"
              value={fmtNum(resumo.porBandeira.length)}
              hint="Sodexo, Alelo, Ticket, VR…"
            />
          </div>

          {/* VR por bandeira + Mix de pagamento */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-5">
              <div className="mb-3 flex items-center gap-2">
                <Ticket className="size-4 text-violet-600" />
                <h3 className="text-sm font-semibold">
                  Vale-Refeição por bandeira
                </h3>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  pra conciliar o saldo
                </span>
              </div>
              {resumo.porBandeira.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Nenhum pedido em VR neste mês
                </p>
              ) : (
                <div className="space-y-2">
                  {resumo.porBandeira.map((b) => (
                    <BandeiraRow
                      key={b.bandeira}
                      bandeira={b.bandeira}
                      pedidos={b.pedidos}
                      valor={b.valor}
                      total={resumo.vrValor}
                    />
                  ))}
                  <div className="mt-2 flex items-center justify-between border-t pt-2 text-xs font-semibold">
                    <span>Total VR</span>
                    <span className="tabular-nums">
                      {fmtNum(resumo.vrPedidos)} ped · {fmtBRL(resumo.vrValor)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border bg-card p-5">
              <div className="mb-3 flex items-center gap-2">
                <CreditCard className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Mix de pagamento</h3>
              </div>
              <div className="space-y-2">
                {resumo.mix.map((m) => {
                  const pct =
                    resumo.totalValor > 0
                      ? (m.valor / resumo.totalValor) * 100
                      : 0
                  const isVr = m.grupo === "Vale-Refeição"
                  return (
                    <div key={m.grupo} className="flex items-center gap-3">
                      <span className="w-28 truncate text-xs">{m.grupo}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full ${isVr ? "bg-violet-500" : "bg-emerald-500"}`}
                          style={{ width: `${Math.max(2, pct)}%` }}
                        />
                      </div>
                      <span className="w-28 text-right text-xs tabular-nums">
                        <span className="font-semibold">
                          {fmtBRLShort(m.valor)}
                        </span>
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          ({pct.toFixed(0)}%)
                        </span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Operação + Promoções + Taxas */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold">Operação do mês</h3>
              <div className="space-y-1.5">
                <LinhaInfo
                  label="Concluídos"
                  value={fmtNum(resumo.concluidos)}
                  tone="emerald"
                />
                <LinhaInfo
                  label="Cancelados"
                  value={fmtNum(resumo.cancelados)}
                  tone={resumo.cancelados > 0 ? "rose" : undefined}
                />
                <LinhaInfo
                  label="Ticket médio"
                  value={fmtBRL(resumo.ticketMedio)}
                />
                <LinhaInfo
                  label="Valor de itens"
                  value={fmtBRL(resumo.valorItens)}
                />
              </div>
              {resumo.porTurno.length > 0 && (
                <div className="mt-3 border-t pt-3">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Por turno
                  </p>
                  <div className="space-y-1.5">
                    {resumo.porTurno.map((t) => (
                      <BarrinhaInfo
                        key={t.chave}
                        label={t.chave}
                        pedidos={t.pedidos}
                        total={resumo.totalPedidos}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold">
                Promoções (incentivos)
              </h3>
              <div className="space-y-1.5">
                <LinhaInfo
                  label="Custeado pelo iFood"
                  value={fmtBRL(resumo.incentivoIfood)}
                  tone="emerald"
                />
                <LinhaInfo
                  label="Custeado pela loja"
                  value={fmtBRL(resumo.incentivoLoja)}
                  tone={resumo.incentivoLoja > 0 ? "rose" : undefined}
                />
                <LinhaInfo
                  label="Custeado pela rede"
                  value={fmtBRL(resumo.incentivoRede)}
                />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                O da loja é custo seu; o do iFood/rede é subsídio da plataforma.
              </p>
            </div>

            <div className="rounded-xl border bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold">Taxas do iFood</h3>
              <div className="space-y-1.5">
                <LinhaInfo
                  label="Taxas e comissões"
                  value={fmtBRL(resumo.taxasComissoes)}
                  tone="rose"
                />
                <LinhaInfo
                  label="Taxa de serviço"
                  value={fmtBRL(resumo.taxaServico)}
                />
                <LinhaInfo
                  label="Taxa de entrega (cliente)"
                  value={fmtBRL(resumo.taxaEntregaCliente)}
                />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Por pedido. O repasse oficial vem da conciliação (Resultado).
              </p>
            </div>
          </div>

          {/* Logística de entrega
              ⚠️ A API não traz `produto_logistico` — medido em 10/08/26: ZERO
              em 147.134 pedidos vindos dos Financial Events, contra 63.729 de
              64.363 nos que vieram de planilha. Loja 100% API cai aqui com uma
              barra só, "—" a 100%, que parece dado e não é.
              Uma barra cheia de nada é pior que bloco nenhum: ela ocupa o lugar
              da informação e não avisa que está vazia. */}
          {resumo.porEntrega.length > 0 &&
            (resumo.porEntrega.every((e) => e.chave === "—") ? (
              <div className="rounded-xl border bg-card p-5">
                <h3 className="mb-2 text-sm font-semibold">
                  Logística de entrega
                </h3>
                <p className="text-sm text-muted-foreground">
                  Não disponível para este período: a integração automática do
                  iFood não informa quem levou o pedido — se foi entregador da
                  plataforma ou da própria loja.
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  Esse detalhe só vem no relatório de Pedidos baixado do portal.
                  Enquanto a loja roda só por API, a quebra fica em branco; o
                  faturamento, as taxas e o pagamento não são afetados.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border bg-card p-5">
                <h3 className="mb-3 text-sm font-semibold">
                  Logística de entrega
                </h3>
                <div className="space-y-2">
                  {resumo.porEntrega.map((e) => (
                    <BarrinhaInfo
                      key={e.chave}
                      label={e.chave}
                      pedidos={e.pedidos}
                      total={resumo.totalPedidos}
                    />
                  ))}
                </div>
              </div>
            ))}

          {/* Vendas por loja (só no consolidado) */}
          {showVrByUnit && (
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="flex items-center justify-between border-b px-5 py-3">
                <h3 className="text-sm font-semibold">
                  Valor vendido por loja{" "}
                  <span className="font-normal text-muted-foreground">
                    ({vrByUnit.length})
                  </span>
                </h3>
                <span className="text-[10px] text-muted-foreground">
                  faturamento · pago e VR embaixo
                </span>
              </div>
              <div className="divide-y">
                {vrByUnit.map((u) => (
                  <Link
                    key={u.unitId}
                    href={unitHref(u.unitCode)}
                    className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/50"
                  >
                    <span className="inline-flex shrink-0 items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                      #{u.unitCode}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {u.unitName}
                      </p>
                      <p className="text-[10px] tabular-nums text-muted-foreground">
                        pago {fmtBRLShort(u.totalValor)}
                        {u.vrValor > 0 &&
                          ` · VR ${fmtBRLShort(u.vrValor)} (${fmtNum(u.vrPedidos)})`}
                      </p>
                    </div>
                    <div className="w-28 shrink-0 text-right">
                      <p className="text-sm font-bold tabular-nums">
                        {u.faturamento > 0 ? fmtBRL(u.faturamento) : "—"}
                      </p>
                      <p className="text-[10px] tabular-nums text-muted-foreground">
                        {fmtNum(u.totalPedidos)} pedidos
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Fonte: relatório de pedidos do iFood. Valor do VR = total pago pelo
            cliente. Não entra no faturamento (que vem da conciliação).
          </p>
        </>
      )}
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
  tone?: "vr"
}) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-lg ${
          tone === "vr"
            ? "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400"
            : "bg-accent text-accent-foreground"
        }`}
      >
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

function BandeiraRow({
  bandeira,
  pedidos,
  valor,
  total,
}: {
  bandeira: string
  pedidos: number
  valor: number
  total: number
}) {
  const pct = total > 0 ? (valor / total) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-xs font-medium">{bandeira}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-violet-500"
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
      <span className="w-32 text-right text-xs tabular-nums">
        <span className="font-semibold">{fmtBRL(valor)}</span>
        <span className="ml-1 text-[10px] text-muted-foreground">
          ({pedidos} ped)
        </span>
      </span>
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

function BarrinhaInfo({
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
      <span className="w-32 truncate text-xs" title={label}>
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
