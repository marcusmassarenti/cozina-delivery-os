"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRight, Check, Loader2, Sparkles, X } from "lucide-react"

import {
  setClientPlanTier,
  toggleNinoDegustacao,
  type BillingActionState,
} from "../_actions"

type Tier = "essencial" | "pro" | "ai"

const PLANOS: { id: Tier; nome: string; desc: string; cor: string }[] = [
  {
    id: "essencial",
    nome: "Essencial",
    desc: "Pra ver o lucro no delivery",
    cor: "violet",
  },
  { id: "pro", nome: "Pro", desc: "Gestão financeira completa", cor: "blue" },
  {
    id: "ai",
    nome: "DeliveryOS AI",
    desc: "IA que lê a loja e monta o plano",
    cor: "emerald",
  },
]
const RANK: Record<Tier, number> = { essencial: 0, pro: 1, ai: 2 }

export function PlanControls({
  holdingId,
  planTier,
  ninoTrialEndsAt,
  onChanged,
}: {
  holdingId: string
  planTier: Tier | null
  ninoTrialEndsAt: string | null
  /** No drawer, re-busca o detalhe (router.refresh não atualiza o drawer). */
  onChanged?: () => void
}) {
  const router = useRouter()
  const [editing, setEditing] = React.useState(false)
  const [busy, setBusy] = React.useState<null | string>(null)
  const [erro, setErro] = React.useState<string | null>(null)

  const atual = planTier ? PLANOS.find((p) => p.id === planTier) : null
  const proximo =
    planTier && RANK[planTier] < 2
      ? PLANOS.find((p) => RANK[p.id] === RANK[planTier] + 1)
      : planTier
        ? null
        : PLANOS[0]
  const degAtiva = !!ninoTrialEndsAt && new Date(ninoTrialEndsAt) > new Date()
  // Degustação só faz sentido antes do AI (o AI já tem o Nino de fábrica).
  const podeDegustar = !planTier || planTier !== "ai"

  // Chama a server action DIRETO (sem passar por variável — indireção assim
  // é frágil no build de produção) e com try/catch: se falhar, o erro aparece
  // na tela em vez de sumir (o guard relança erros não-auth, e um `void run`
  // engolia tudo — era por isso que "não acontecia nada").
  async function definirPlano(tier: Tier | "") {
    setBusy(`plano:${tier}`)
    setErro(null)
    const fd = new FormData()
    fd.set("holdingId", holdingId)
    fd.set("tier", tier)
    try {
      const res: BillingActionState = await setClientPlanTier({ ok: false }, fd)
      if (res.ok) {
        setEditing(false)
        router.refresh()
        onChanged?.()
      } else {
        setErro(res.message ?? "Não deu certo.")
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar o plano.")
    } finally {
      setBusy(null)
    }
  }

  async function degustacao(acao: "liberar" | "encerrar") {
    setBusy(`deg:${acao}`)
    setErro(null)
    const fd = new FormData()
    fd.set("holdingId", holdingId)
    fd.set("acao", acao)
    try {
      const res: BillingActionState = await toggleNinoDegustacao(
        { ok: false },
        fd,
      )
      if (res.ok) {
        router.refresh()
        onChanged?.()
      } else {
        setErro(res.message ?? "Não deu certo.")
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao liberar a cortesia.")
    } finally {
      setBusy(null)
    }
  }

  const fmtDia = (iso: string) =>
    new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })

  return (
    <div className="flex flex-col gap-3">
      {erro && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          {erro}
        </p>
      )}
      {/* Plano atual + trocar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Plano atual
          </p>
          {atual ? (
            <p className="text-sm font-semibold">
              {atual.nome}{" "}
              <span className="font-normal text-muted-foreground">
                · {atual.desc}
              </span>
            </p>
          ) : (
            <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
              Não definido
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
        >
          {editing ? "Fechar" : atual ? "Trocar plano" : "Definir plano"}
        </button>
      </div>

      {/* Seletor de plano */}
      {editing && (
        <div className="grid gap-1.5 rounded-lg border bg-muted/30 p-2">
          {PLANOS.map((p) => {
            const on = planTier === p.id
            return (
              <button
                key={p.id}
                type="button"
                disabled={busy != null}
                onClick={() => definirPlano(p.id)}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  on
                    ? "border-primary bg-primary/10"
                    : "bg-card hover:bg-muted"
                }`}
              >
                <span className="flex-1">
                  <span className="font-semibold">{p.nome}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {p.desc}
                  </span>
                </span>
                {busy === `plano:${p.id}` ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : on ? (
                  <Check className="size-4 text-primary" />
                ) : null}
              </button>
            )
          })}
          {planTier && (
            <button
              type="button"
              disabled={busy != null}
              onClick={() => definirPlano("")}
              className="rounded-md px-3 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Limpar plano (deixar não definido)
            </button>
          )}
        </div>
      )}

      {/* Sugestão de upgrade */}
      {!editing && proximo && (
        <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs">
          <ArrowUpRight className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="flex-1 text-muted-foreground">
            {atual ? "Upgrade sugerido:" : "Comece em:"}{" "}
            <b className="text-foreground">{proximo.nome}</b> — {proximo.desc}
          </span>
          <button
            type="button"
            disabled={busy != null}
            onClick={() => definirPlano(proximo.id)}
            className="shrink-0 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy === `plano:${proximo.id}` ? "…" : `Subir pra ${proximo.nome}`}
          </button>
        </div>
      )}

      {/* Degustação do Nino AI (Essencial/Pro) */}
      {podeDegustar && (
        <div className="rounded-lg border border-emerald-200/70 bg-emerald-50/50 px-3 py-2.5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-emerald-600 dark:text-emerald-400" />
            <p className="flex-1 text-xs font-semibold">
              Nino AI por conta da casa
            </p>
            {degAtiva && (
              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                ativa até {fmtDia(ninoTrialEndsAt!)}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Libera o Nino AI por 7 dias com uma cota enxuta (~20 mensagens) pro
            cliente experimentar — sem virar plano AI nem mexer no Financeiro.
            Ao entrar, ele vê um convite pra abrir o Nino.
          </p>
          <div className="mt-2 flex items-center gap-2">
            {degAtiva ? (
              <button
                type="button"
                disabled={busy != null}
                onClick={() => degustacao("encerrar")}
                className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                {busy === "deg:encerrar" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <X className="size-3.5" />
                )}
                Encerrar agora
              </button>
            ) : (
              <button
                type="button"
                disabled={busy != null}
                onClick={() => degustacao("liberar")}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy === "deg:liberar" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                Liberar 7 dias
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
