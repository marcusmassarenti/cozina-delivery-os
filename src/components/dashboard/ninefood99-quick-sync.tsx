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
              <Group
                tone="emerald"
                icon={<CheckCircle2 className="size-4" />}
                title="Financeiro importado"
                empty="Nenhuma loja com financeiro agora"
                rows={fin.map((r) => ({
                  key: r.appShopId,
                  name: r.name ?? r.appShopId.slice(0, 8),
                  detail: `${r.count.toLocaleString("pt-BR")} pedidos · ${fmtBRL(r.bruto)} bruto`,
                }))}
              />
              <Group
                tone="sky"
                icon={<ShoppingBag className="size-4" />}
                title="Cardápio atualizado"
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
  empty,
  rows,
}: {
  tone: "emerald" | "sky" | "rose"
  icon: React.ReactNode
  title: string
  empty: string
  rows: { key: string; name: string; detail: string }[]
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
      {rows.length === 0 ? (
        empty ? (
          <p className="mt-1 pl-5 text-xs text-muted-foreground">{empty}</p>
        ) : null
      ) : (
        <ul className="mt-1.5 space-y-1">
          {rows.map((r) => (
            <li
              key={r.key}
              className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-1.5"
            >
              <span className="truncate text-sm font-medium">{r.name}</span>
              <span className="shrink-0 text-right text-[11px] text-muted-foreground">
                {r.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
