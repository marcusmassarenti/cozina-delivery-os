"use client"

import { useState } from "react"
import { ChevronDown, Store } from "lucide-react"

import { useNavigate } from "@/components/shared/navigation-progress"
import { BrandLogo } from "@/components/brand-logo"
import { fmtBRL } from "@/lib/format"
import type { LojaResumo } from "@/lib/data/caixa"

/**
 * Comparativo por loja — recolhido mostra só o total da rede.
 *
 * Fechado por padrão porque a leitura de cima pra baixo é do geral pro
 * detalhe: com 16 lojas (e o SaaS mirando 500), a tabela inteira empurrava o
 * resto da Visão Geral pra fora da tela antes de responder "como está a rede".
 * O cabeçalho de colunas fica visível nos dois estados — sem ele, o
 * R$ 269.002,47 do total apareceria sem dizer que é "a receber".
 */
export function LojasComparativo({
  lojas,
  periodo,
}: {
  lojas: LojaResumo[]
  periodo?: string
}) {
  const [aberto, setAberto] = useState(false)
  const navigate = useNavigate()
  if (lojas.length <= 1) return null

  const total = lojas.reduce(
    (t, l) => ({
      saldo: t.saldo + l.saldo,
      recebido: t.recebido + l.recebido,
      pago: t.pago + l.pago,
      aReceber: t.aReceber + l.aReceber,
      aPagar: t.aPagar + l.aPagar,
      resultado: t.resultado + l.resultado,
    }),
    { saldo: 0, recebido: 0, pago: 0, aReceber: 0, aPagar: 0, resultado: 0 },
  )

  const href = (id: string | null) => {
    const p = new URLSearchParams()
    if (periodo) p.set("periodo", periodo)
    if (id) p.set("loja", id)
    const qs = p.toString()
    return qs ? `/financeiro?${qs}` : "/financeiro"
  }

  const Cell = ({ v, cls = "" }: { v: number; cls?: string }) => (
    <td className={`px-3 py-2.5 text-right tabular-nums ${cls}`}>{fmtBRL(v)}</td>
  )

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {/* O cabeçalho inteiro é o botão: alvo grande, e evita a dúvida de onde
          clicar pra abrir — foi justamente o que não funcionou antes, quando
          só o nome da loja era clicável. */}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center justify-between gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Store className="size-4 text-muted-foreground" />
          Comparativo por loja
        </h2>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {lojas.length} {lojas.length === 1 ? "loja" : "lojas"} ·{" "}
          {aberto ? "ocultar detalhe" : "ver por loja"}
          <ChevronDown
            className={`size-4 transition-transform ${aberto ? "" : "-rotate-90"}`}
          />
        </span>
      </button>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Loja</th>
              <th className="px-3 py-2 text-right font-medium">Saldo</th>
              <th className="px-3 py-2 text-right font-medium">Recebido</th>
              <th className="px-3 py-2 text-right font-medium">Pago</th>
              <th className="px-3 py-2 text-right font-medium">A receber</th>
              <th className="px-3 py-2 text-right font-medium">A pagar</th>
              <th className="px-4 py-2 text-right font-medium">Resultado</th>
            </tr>
          </thead>
          {aberto && (
            <tbody>
              {lojas.map((l) => (
                <tr
                  key={l.unitId ?? "rede"}
                  onClick={() => navigate(href(l.unitId))}
                  className="cursor-pointer border-b transition hover:bg-accent/50 last:border-0"
                >
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <BrandLogo size="sm" logoUrl={l.logoUrl} name={l.name} />
                      <span className="font-medium">{l.name}</span>
                    </span>
                  </td>
                  <Cell v={l.saldo} cls="font-medium" />
                  <Cell v={l.recebido} cls="text-emerald-600" />
                  <Cell v={l.pago} cls="text-rose-600" />
                  <Cell v={l.aReceber} cls="text-emerald-500" />
                  <Cell v={l.aPagar} cls="text-amber-600" />
                  <td
                    className={`px-4 py-2.5 text-right font-semibold tabular-nums ${
                      l.resultado >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {fmtBRL(l.resultado)}
                  </td>
                </tr>
              ))}
            </tbody>
          )}
          <tfoot>
            <tr className={`font-semibold ${aberto ? "border-t-2 bg-muted/40" : ""}`}>
              <td className="px-4 py-2.5">Total da rede</td>
              <Cell v={total.saldo} />
              <Cell v={total.recebido} />
              <Cell v={total.pago} />
              <Cell v={total.aReceber} />
              <Cell v={total.aPagar} />
              <td
                className={`px-4 py-2.5 text-right tabular-nums ${
                  total.resultado >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {fmtBRL(total.resultado)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
