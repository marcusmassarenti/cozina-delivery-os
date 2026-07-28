/**
 * Saúde das integrações — a tela que o e-mail diário aponta.
 *
 * Só o dono vê: são dados de todos os clientes lado a lado.
 */
import { redirect } from "next/navigation"
import { Activity } from "lucide-react"

import { isSuperadmin } from "@/lib/auth/permissions"
import { diagnosticarIntegracoes } from "@/lib/data/saude-integracoes"

import { SaudeView } from "./_components/saude-view"

export const dynamic = "force-dynamic"

export default async function SaudePage() {
  if (!(await isSuperadmin())) redirect("/")

  const s = await diagnosticarIntegracoes()

  return (
    <div className="flex flex-1 flex-col gap-5 bg-muted/30 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Activity className="size-6 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Saúde das integrações</h1>
        {/* Três estados, não dois: "tudo certo" com itens em observação faz o
            selo verde conviver com números pendentes na mesma tela — e um selo
            que contradiz o que está do lado deixa de ser lido. */}
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
            !s.tudoCerto
              ? "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400"
              : s.temObservacao
                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
          }`}
        >
          {!s.tudoCerto ? "requer atenção" : s.temObservacao ? "sem alertas" : "tudo certo"}
        </span>
      </div>
      <SaudeView saude={s} />
    </div>
  )
}
