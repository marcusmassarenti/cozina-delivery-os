"use client"

import * as React from "react"

import type { SaudeIntegracoes, Gravidade } from "@/lib/data/saude-integracoes"

const SELO: Record<Gravidade, { label: string; cls: string }> = {
  alerta: {
    label: "Alerta",
    cls: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400",
  },
  atencao: {
    label: "De olho",
    cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
  },
  ok: {
    label: "Ok",
    cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
  },
}

function dataCurta(v: string | null): string {
  if (!v) return "—"
  const d = v.slice(0, 10).split("-")
  return `${d[2]}/${d[1]}`
}
function horaCurta(v: string | null): string {
  if (!v) return "nunca"
  return new Date(v).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function SaudeView({ saude: s }: { saude: SaudeIntegracoes }) {
  // Padrão: esconder o que está ok. Numa tela de diagnóstico, 38 linhas verdes
  // enterram as 3 que importam.
  const [mostrarOk, setMostrarOk] = React.useState(false)
  const lojas = mostrarOk ? s.lojas : s.lojas.filter((l) => l.gravidade !== "ok")

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi titulo="Lojas na API" valor={String(s.resumo.lojasConectadas)} />
        <Kpi titulo="Com dado em dia" valor={String(s.resumo.lojasOk)} bom />
        <Kpi
          titulo="Precisam de ação"
          valor={String(s.resumo.lojasAlerta)}
          ruim={s.resumo.lojasAlerta > 0}
        />
        <Kpi
          titulo="Rotinas rodando"
          valor={`${s.resumo.cronsOk}/${s.crons.length}`}
          ruim={s.crons.some((c) => c.gravidade === "alerta")}
        />
      </div>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
          <h2 className="text-sm font-semibold">Lojas conectadas</h2>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={mostrarOk}
              onChange={(e) => setMostrarOk(e.target.checked)}
              className="size-3.5 accent-primary"
            />
            Mostrar também as que estão ok
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-2.5 font-semibold">Cliente / Loja</th>
                <th className="px-3 py-2.5 font-semibold">Situação</th>
                <th className="px-3 py-2.5 font-semibold">Último pedido</th>
                <th className="px-3 py-2.5 font-semibold">Financeiro até</th>
                <th className="px-3 py-2.5 font-semibold">Avaliação</th>
                <th className="px-3 py-2.5 text-right font-semibold">Pedidos 7d</th>
              </tr>
            </thead>
            <tbody>
              {lojas.map((l) => (
                <tr key={`${l.unitId}-${l.plataforma}`} className="border-b last:border-0">
                  <td className="px-5 py-2.5">
                    <div className="font-medium">{l.loja}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.cliente} · {l.code}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${SELO[l.gravidade].cls}`}
                    >
                      {SELO[l.gravidade].label}
                    </span>
                    <div className="mt-1 max-w-xs text-xs text-muted-foreground">{l.motivo}</div>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{dataCurta(l.ultimoPedido)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{dataCurta(l.ultimoFinanceiro)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{dataCurta(l.ultimaAvaliacao)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{l.pedidos7d}</td>
                </tr>
              ))}
              {lojas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-muted-foreground">
                    Nenhuma loja precisa de atenção. As {s.resumo.lojasOk} conectadas estão com o
                    dado em dia com as próprias vendas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-5 py-3">
          <h2 className="text-sm font-semibold">Rotinas automáticas</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-2.5 font-semibold">Rotina</th>
                <th className="px-3 py-2.5 font-semibold">Situação</th>
                <th className="px-3 py-2.5 font-semibold">Última execução</th>
                <th className="px-3 py-2.5 text-right font-semibold">Duração</th>
              </tr>
            </thead>
            <tbody>
              {s.crons.map((c) => (
                <tr key={c.nome} className="border-b last:border-0">
                  <td className="px-5 py-2.5 font-medium">{c.nome}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${SELO[c.gravidade].cls}`}
                    >
                      {SELO[c.gravidade].label}
                    </span>
                    <div className="mt-1 text-xs text-muted-foreground">{c.motivo}</div>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{horaCurta(c.ultimaExecucao)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {c.duracaoMs != null ? `${(c.duracaoMs / 1000).toFixed(1)}s` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        A régua é por loja, contra ela mesma: loja sem venda não gera lançamento, então atraso só
        vira alerta quando existe pedido recente sem o financeiro correspondente.
      </p>
    </div>
  )
}

function Kpi({
  titulo,
  valor,
  bom,
  ruim,
}: {
  titulo: string
  valor: string
  bom?: boolean
  ruim?: boolean
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {titulo}
      </p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          ruim ? "text-rose-600 dark:text-rose-400" : bom ? "text-emerald-600 dark:text-emerald-400" : ""
        }`}
      >
        {valor}
      </p>
    </div>
  )
}
