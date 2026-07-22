"use client"

import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, CheckCircle2, RefreshCw, ShoppingBag, XCircle } from "lucide-react"

import {
  runNinefood99SyncAll,
  type Ninefood99SyncAllState,
} from "@/app/(app)/importacao/_actions-ninefood"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PlatformLogo } from "@/components/platform-logo"
import { fmtBRL } from "@/lib/format"

const initial: Ninefood99SyncAllState = { ok: false }

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

/** "2026-06" → "junho/2026". */
function fmtCompetencia(comp?: string): string | null {
  const m = (comp ?? "").match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const mes = MESES[Number(m[2]) - 1]
  return mes ? `${mes}/${m[1]}` : null
}

/**
 * Botão pra sincronizar o 99 (financeiro + cardápio) direto do banner de
 * cobertura do Dashboard. Ao concluir, abre um popup mostrando o que foi
 * importado por loja (igual ao "Sincronizar iFood").
 */
export function Ninefood99QuickSync({
  year,
  month,
}: {
  year: number
  month: number
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(
    runNinefood99SyncAll,
    initial,
  )
  const [open, setOpen] = useState(false)

  // Quando a action termina (sucesso com resultados OU erro), abre o popup e
  // atualiza os dados da tela.
  const hasResult =
    !!state.financeiro || !!state.cardapio || (!state.ok && !!state.message)
  useEffect(() => {
    if (hasResult) {
      setOpen(true)
      if (state.financeiro || state.cardapio) router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const done = state.ok && (state.financeiro != null || state.cardapio != null)

  const fin = (state.financeiro ?? []).filter((r) => !r.error)
  const card = (state.cardapio ?? []).filter((r) => !r.error && r.items > 0)
  const periodoLabel = fmtCompetencia(state.competencia)
  const totalNovos = fin.reduce((s, r) => s + (r.novos ?? 0), 0)
  const erros = [
    ...(state.financeiro ?? []).filter((r) => r.error),
    ...(state.cardapio ?? []).filter((r) => r.error),
  ]
  // Falha TOTAL = não rodou nada (ex.: sem permissão, competência inválida).
  // Quando rodou mas teve erro por loja, mostramos os cards (incl. "Com erro").
  const totalFailure = !state.financeiro && !state.cardapio && !!state.message

  return (
    <>
      <form action={formAction}>
        <input type="hidden" name="year" value={year} />
        <input type="hidden" name="month" value={month} />
        <button
          type="submit"
          disabled={pending}
          title="Sincronizar financeiro + cardápio do 99 Food agora"
          className="inline-flex items-center gap-1 rounded-full border border-current/25 px-2 py-0.5 text-[11px] font-medium opacity-70 transition hover:opacity-100 disabled:opacity-50"
        >
          {pending ? (
            <RefreshCw className="size-3 animate-spin" />
          ) : done ? (
            <Check className="size-3" />
          ) : (
            <RefreshCw className="size-3" />
          )}
          {pending
            ? "Sincronizando 99…"
            : done
              ? "99 sincronizado"
              : "Sincronizar 99"}
        </button>
      </form>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlatformLogo platform="99food" className="size-5" />
              Sincronização 99 Food
            </DialogTitle>
            <DialogDescription>
              {totalFailure
                ? "A sincronização falhou."
                : "Financeiro + cardápio das lojas vinculadas via API."}
            </DialogDescription>
          </DialogHeader>

          {totalFailure ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
              {state.message}
            </div>
          ) : (
            <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
              {/* Período importado + quanto entrou de dado novo. */}
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
                <span className="font-medium text-foreground">
                  Período importado:
                </span>{" "}
                {periodoLabel ?? "—"}
                {" · "}
                {totalNovos > 0 ? (
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    {totalNovos.toLocaleString("pt-BR")} lançamento
                    {totalNovos === 1 ? "" : "s"} novo{totalNovos === 1 ? "" : "s"}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    nada novo (o período já estava sincronizado)
                  </span>
                )}
              </div>
              <Group
                tone="emerald"
                icon={<CheckCircle2 className="size-4" />}
                title="Financeiro importado"
                empty="Nenhuma loja com financeiro agora"
                rows={fin.map((r) => ({
                  key: r.appShopId,
                  name: r.name ?? r.appShopId.slice(0, 8),
                  nova: r.primeiraSincronizacao,
                  detail:
                    `${r.count.toLocaleString("pt-BR")} pedidos · ` +
                    `${(r.novos ?? 0) > 0 ? `+${(r.novos ?? 0).toLocaleString("pt-BR")} novos · ` : ""}` +
                    `${fmtBRL(r.bruto)} bruto`,
                }))}
              />
              <Group
                tone="sky"
                icon={<ShoppingBag className="size-4" />}
                title="Cardápio atualizado"
                subtitle="Snapshot do cardápio atual (não depende do período)"
                empty="Nenhum item de cardápio agora"
                rows={card.map((r) => ({
                  key: r.appShopId,
                  name: r.name ?? r.appShopId.slice(0, 8),
                  detail: `${r.items.toLocaleString("pt-BR")} itens · ${r.indisponiveis} indisponíveis`,
                }))}
              />
              {erros.length > 0 && (
                <Group
                  tone="rose"
                  icon={<XCircle className="size-4" />}
                  title="Com erro"
                  empty=""
                  rows={erros.map((r, i) => ({
                    key: `${r.appShopId}-${i}`,
                    name: r.name ?? r.appShopId.slice(0, 8),
                    detail: r.error ?? "erro",
                  }))}
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function Group({
  tone,
  icon,
  title,
  subtitle,
  empty,
  rows,
}: {
  tone: "emerald" | "sky" | "rose"
  icon: React.ReactNode
  title: string
  subtitle?: string
  empty: string
  rows: { key: string; name: string; detail: string; nova?: boolean }[]
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "sky"
        ? "text-sky-700 dark:text-sky-400"
        : "text-rose-700 dark:text-rose-400"

  return (
    <div>
      <div className={`flex items-center gap-1.5 text-xs font-semibold ${toneCls}`}>
        {icon}
        {title}
        <span className="text-muted-foreground">({rows.length})</span>
      </div>
      {subtitle ? (
        <p className="mt-0.5 pl-5 text-[11px] text-muted-foreground">{subtitle}</p>
      ) : null}
      {rows.length === 0 ? (
        empty ? (
          <p className="mt-1 pl-5 text-xs text-muted-foreground">{empty}</p>
        ) : null
      ) : (
        <ul className="mt-1.5 space-y-1">
          {rows.map((r) => (
            // Nome em cima (inteiro, sem truncar) e números embaixo: numa
            // linha só o nome era o primeiro a ser cortado — e é justamente
            // o que diz QUAL loja sincronizou.
            <li key={r.key} className="rounded-md border bg-card px-3 py-2">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="text-sm font-medium">{r.name}</span>
                {r.nova && (
                  <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                    nova loja conectada
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                {r.detail}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
