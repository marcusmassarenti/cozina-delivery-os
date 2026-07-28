"use client"

import * as React from "react"

import type { SaudeIntegracoes, Gravidade } from "@/lib/data/saude-integracoes"
import { rotulo } from "@/lib/cron-labels"
import { PlatformLogo } from "@/components/platform-logo"

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
  const [plat, setPlat] = React.useState<"todas" | "ifood" | "99food">("todas")
  const lojas = s.lojas
    .filter((l) => plat === "todas" || l.plataforma === plat)
    .filter((l) => mostrarOk || l.gravidade !== "ok")

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Separado por plataforma: "41 lojas na API" não dizia se o problema
            era do iFood ou da 99, e são integrações independentes — uma pode
            cair sem a outra sentir. */}
        <Kpi
          titulo="iFood"
          valor={`${s.resumo.ifood.ok}/${s.resumo.ifood.total}`}
          ruim={s.resumo.ifood.alerta > 0}
          bom={s.resumo.ifood.alerta === 0}
        />
        <Kpi
          titulo="99 Food"
          valor={`${s.resumo.noveNove.ok}/${s.resumo.noveNove.total}`}
          ruim={s.resumo.noveNove.alerta > 0}
          bom={s.resumo.noveNove.alerta === 0}
        />
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
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">Lojas conectadas</h2>
            <div className="flex gap-1">
              {(
                [
                  ["todas", "Todas", s.resumo.lojasConectadas],
                  ["ifood", "iFood", s.resumo.ifood.total],
                  ["99food", "99 Food", s.resumo.noveNove.total],
                ] as const
              ).map(([key, label, n]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPlat(key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    plat === key
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {label}
                  <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums">
                    {n}
                  </span>
                </button>
              ))}
            </div>
          </div>
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
                <th className="px-3 py-2.5 font-semibold">Plataforma</th>
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
                    <div className="flex items-center gap-1.5">
                      <PlatformLogo platform={l.plataforma} className="size-4" />
                      <span className="text-xs">
                        {l.plataforma === "99food" ? "99 Food" : "iFood"}
                      </span>
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
                  <td className="px-3 py-2.5 tabular-nums">
                    {l.plataforma === "99food" ? (
                      // A 99 não expõe avaliação por API. Mostrar "—" aqui
                      // pareceria dado atrasado; "n/d" diz que não existe.
                      <span className="text-xs text-muted-foreground">n/d</span>
                    ) : (
                      dataCurta(l.ultimaAvaliacao)
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{l.pedidos7d}</td>
                </tr>
              ))}
              {lojas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-muted-foreground">
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
                  <td className="px-5 py-2.5">
                    <div className="font-medium">{rotulo(c.nome).titulo}</div>
                    <div className="text-xs text-muted-foreground">
                      {rotulo(c.nome).descricao}
                    </div>
                    {/* Nome técnico continua à vista: é ele que aparece na
                        Vercel e nos logs quando algo precisa ser investigado. */}
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">
                      {c.nome}
                    </div>
                  </td>
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
