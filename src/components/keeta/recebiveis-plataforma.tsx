"use client"

import * as React from "react"
import { CalendarClock, Check, ChevronDown, Clock } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { fmtBRL, fmtNum } from "@/lib/format"
import type { KeetaRepasseResumo } from "@/lib/data/keeta-repasses"
import type { Deposito99 } from "@/lib/data/ninefood-repasses"

function fmtDia(d: string | null) {
  if (!d) return "—"
  const [, m, day] = d.split("-")
  return `${day}/${m}`
}

/**
 * Recebíveis — "quando cai o dinheiro", com seletor de plataforma igual ao
 * "Para onde vai o bruto": 99 (API, data prevista por pedido) e Keeta
 * (repasse da Fatura). Sem "Todas": cada plataforma paga num calendário
 * próprio, e somar datas de ciclos diferentes não responde "quando cai".
 * O iFood não entra: não disponibiliza o repasse em relatório.
 *
 * O 99 vem conciliado com o DRE (Duéle / DG FOODS, 21/09/26): o dono compara o
 * extrato do banco com o líquido da tela no meio do mês e acha que recebe
 * menos. A diferença é o depósito que ainda não caiu — e ele tem data aqui.
 */
export function RecebiveisPlataforma({
  keeta,
  depositos99,
  liquido99Dre = 0,
}: {
  keeta: KeetaRepasseResumo
  depositos99?: Deposito99[] | null
  /** Líquido do 99 no DRE, mesmo período — pra conciliar. */
  liquido99Dre?: number
}) {
  const tem99 = !!depositos99 && depositos99.length > 0
  const temKeeta = keeta.ciclos.length > 0
  const plats = [
    ...(tem99 ? (["99food"] as const) : []),
    ...(temKeeta ? (["keeta"] as const) : []),
  ]
  const [sel, setSel] = React.useState<"99food" | "keeta">(plats[0] ?? "99food")
  if (plats.length === 0) return null
  const multi = plats.length > 1
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <CalendarClock className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Recebíveis · quando cai</h3>
        <div className="ml-auto flex items-center gap-1">
          {plats.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setSel(p)}
              aria-label={p}
              aria-pressed={sel === p}
              className={`flex items-center rounded-md p-1 transition-colors ${
                multi && sel === p
                  ? "bg-primary/10 ring-1 ring-primary"
                  : multi
                    ? "hover:bg-muted"
                    : ""
              }`}
            >
              <PlatformLogo platform={p} size="sm" />
            </button>
          ))}
        </div>
      </div>

      {sel === "99food" && tem99 && (
        <Secao99 depositos={depositos99!} liquidoDre={liquido99Dre} />
      )}
      {sel === "keeta" && temKeeta && <SecaoKeeta keeta={keeta} />}

      <p className="mt-3 text-[10px] text-muted-foreground">
        O iFood não aparece aqui — não disponibiliza o repasse em relatório.
      </p>
    </div>
  )
}

/** "08–12/09" no mesmo mês, "29/08–04/09" quando vira o mês — cabe na caixa. */
function periodoCurto(de: string, ate: string) {
  if (de === ate) return fmtDia(de)
  if (de.slice(0, 7) === ate.slice(0, 7)) return `${de.slice(8, 10)}–${fmtDia(ate)}`
  return `${fmtDia(de)}–${fmtDia(ate)}`
}

function Tile({ caiu, dia, valor, sub }: { caiu: boolean; dia: string | null; valor: number; sub?: string }) {
  return (
    <li className="flex items-center justify-between gap-2 rounded border bg-muted/20 px-2 py-1">
      <span className="flex min-w-0 items-center gap-1.5">
        {caiu ? (
          <Check className="size-3 shrink-0 text-emerald-600" strokeWidth={3} />
        ) : (
          <Clock className="size-3 shrink-0 text-amber-600" />
        )}
        <span className="truncate">
          Cai {fmtDia(dia)}
          {sub && <span className="text-[10px] text-muted-foreground"> · {sub}</span>}
        </span>
      </span>
      <span className="shrink-0 font-medium tabular-nums">{fmtBRL(valor)}</span>
    </li>
  )
}

function Secao99({ depositos, liquidoDre }: { depositos: Deposito99[]; liquidoDre: number }) {
  const total = depositos.reduce((a, d) => a + d.total, 0)
  const liquidado = depositos.filter((d) => d.caiu).reduce((a, d) => a + d.total, 0)

  // Conciliação com o DRE: cada parcela tem nome, e a soma fecha no centavo.
  const cancelPagos = depositos.reduce((a, d) => a + d.canceladosPagos, 0)
  const ajustes = depositos.reduce((a, d) => a + d.ajustes, 0)
  const porFora = depositos.reduce((a, d) => a + (d.repasseVendas - d.liquido), 0)
  // Venda do período que o extrato do 99 ainda não trouxe com data.
  const semDeposito = liquidoDre - depositos.reduce((a, d) => a + d.liquido, 0)
  const diferenca = total - liquidoDre
  const partes = [
    { label: "pedidos cancelados que o 99 pagou mesmo assim", value: cancelPagos },
    { label: "estornos e reembolsos descontados da loja", value: ajustes },
    { label: "vale-refeição e outros pagos por outro canal", value: porFora },
    { label: "vendas ainda sem depósito marcado", value: -semDeposito },
  ].filter((p) => Math.abs(p.value) > 0.005)

  return (
    <div>
      <div className="mb-2">
        <p className="text-xs tabular-nums text-muted-foreground">
          a cair <b className="text-amber-600">{fmtBRL(total - liquidado)}</b> ·
          já caiu <b className="text-emerald-600">{fmtBRL(liquidado)}</b>
        </p>
      </div>
      <ul className="grid gap-1 text-xs sm:grid-cols-2">
        {depositos.map((d) => (
          <Tile
            key={d.deposito}
            caiu={d.caiu}
            dia={d.deposito}
            valor={d.total}
            sub={`vendas ${periodoCurto(d.vendaDe, d.vendaAte)}`}
          />
        ))}
      </ul>
      {/* Por que o total difere do líquido do DRE. Fechado por padrão: é a
          resposta pra quem compara com o extrato, não leitura do dia a dia. */}
      {Math.abs(diferenca) > 0.5 && (
        <details className="group mt-1.5 text-[11px] text-muted-foreground">
          <summary className="flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
            O 99 paga{" "}
            <b className="font-semibold text-foreground tabular-nums">
              {fmtBRL(total)}
            </b>{" "}
            por essas vendas —{" "}
            {fmtBRL(Math.abs(diferenca))} {diferenca > 0 ? "a mais" : "a menos"} que o
            líquido do DRE
          </summary>
          <ul className="mt-1 space-y-0.5 rounded-md bg-muted/50 px-3 py-2">
            <li className="flex justify-between gap-2">
              <span>líquido do DRE ({fmtNum(depositos.reduce((a, d) => a + d.pedidos, 0))} pedidos)</span>
              <span className="shrink-0 tabular-nums">{fmtBRL(liquidoDre)}</span>
            </li>
            {partes.map((p) => (
              <li key={p.label} className="flex justify-between gap-2">
                <span>{p.label}</span>
                <span className="shrink-0 tabular-nums">
                  {p.value >= 0 ? "+" : "−"} {fmtBRL(Math.abs(p.value))}
                </span>
              </li>
            ))}
            <li className="flex justify-between gap-2 border-t pt-0.5 font-medium text-foreground">
              <span>= total que o 99 paga</span>
              <span className="shrink-0 tabular-nums">{fmtBRL(total)}</span>
            </li>
          </ul>
        </details>
      )}
    </div>
  )
}

function SecaoKeeta({ keeta }: { keeta: KeetaRepasseResumo }) {
  return (
    <div>
      <div className="mb-2">
        <p className="text-xs tabular-nums text-muted-foreground">
          a liquidar <b className="text-amber-600">{fmtBRL(keeta.aLiquidar)}</b> ·
          liquidado <b className="text-emerald-600">{fmtBRL(keeta.liquidado)}</b>
        </p>
      </div>
      <ul className="grid gap-1 text-xs sm:grid-cols-2">
        {keeta.ciclos.map((c, i) => (
          <Tile
            key={c.ciclo ?? c.dataLiquidacao ?? i}
            caiu={c.liquidado}
            dia={c.dataLiquidacao}
            valor={c.valor}
          />
        ))}
      </ul>
    </div>
  )
}
