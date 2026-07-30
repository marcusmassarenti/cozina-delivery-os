"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"

import { PlatformLogo } from "@/components/platform-logo"
import type { LojaSemDado } from "@/lib/data/lojas-sem-dado"
import {
  naoVendoNessaPlataforma,
  type SemDadoState,
} from "@/app/(app)/_actions-sem-dado"

const NOME: Record<string, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
}

/**
 * Aviso das lojas que declararam uma plataforma e nunca trouxeram dado.
 *
 * Mora DENTRO da faixa de cobertura, em cinza, sem ícone de alerta e sem
 * vermelho. Isto aqui não é urgência: está assim há meses e vai continuar
 * amanhã. Aviso permanente pintado de urgente é como se aprende a ignorar os
 * avisos que importam de verdade — inclusive os que a gente manda por e-mail.
 *
 * Por isso também não vira e-mail: e-mail é pra coisa que MUDOU.
 */
export function LojasSemDadoAviso({ lojas }: { lojas: LojaSemDado[] }) {
  const [aberto, setAberto] = React.useState(false)
  if (lojas.length === 0) return null

  // Agrupa por plataforma: "3 lojas sem dado do iFood" diz o que fazer;
  // "3 pares loja-plataforma" não diz nada.
  const porPlat = new Map<string, LojaSemDado[]>()
  for (const l of lojas) {
    if (!porPlat.has(l.plataforma)) porPlat.set(l.plataforma, [])
    porPlat.get(l.plataforma)!.push(l)
  }
  const resumo = [...porPlat.entries()]
    .map(([p, ls]) => `${ls.length} ${ls.length === 1 ? "loja" : "lojas"} no ${NOME[p]}`)
    .join(" · ")

  return (
    <div className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="underline-offset-2 hover:text-foreground hover:underline"
      >
        {resumo} sem nenhum dado importado — {aberto ? "esconder" : "ver quais"}
      </button>

      {aberto && (
        <ul className="mt-1.5 space-y-1">
          {lojas.map((l) => (
            <li
              key={`${l.unitId}-${l.plataforma}`}
              className="flex flex-wrap items-center gap-x-2 gap-y-1"
            >
              <PlatformLogo platform={l.plataforma} size="sm" />
              <span className="text-foreground/80">
                {l.code ? `${l.code} · ` : ""}
                {l.nome}
              </span>
              <BotaoNaoVendo unitId={l.unitId} platform={l.plataforma} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function BotaoNaoVendo({
  unitId,
  platform,
}: {
  unitId: string
  platform: string
}) {
  const router = useRouter()
  const [state, action] = useActionState<SemDadoState, FormData>(
    naoVendoNessaPlataforma,
    { ok: false },
  )
  React.useEffect(() => {
    if (state.ok) router.refresh()
  }, [state.ok, router])

  if (state.ok) return <span className="text-emerald-700 dark:text-emerald-400">removida</span>

  return (
    <form action={action} className="inline">
      <input type="hidden" name="unit_id" value={unitId} />
      <input type="hidden" name="platform" value={platform} />
      <Submit />
      {state.message && !state.ok && (
        <span className="ml-1.5 text-rose-700 dark:text-rose-400">
          {state.message}
        </span>
      )}
    </form>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="underline underline-offset-2 hover:text-foreground disabled:opacity-50"
      title="Tira a plataforma do cadastro desta loja — pode marcar de novo depois"
    >
      {pending ? "removendo..." : "não vendo nessa plataforma"}
    </button>
  )
}
