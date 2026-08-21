"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { HandCoins, X } from "lucide-react"

import { setIndicadoPor } from "../_actions"

type Estado = { ok: boolean; message?: string; error?: string }

/**
 * Quem indicou este cliente.
 *
 * ── POR QUE (Marcus, 21/08/26) ───────────────────────────────────────────
 * Cupom e indicação são a MESMA coisa no sistema: o cupom é o código que o
 * indicador espalha, e quem o usa vira indicado dele. Por isso aqui não há
 * dois campos — quem deu o cupom é quem recebe a comissão.
 *
 * O campo vivia escondido dentro do convite do Asaas, então cliente de
 * cobrança manual não tinha como receber o vínculo, e a comissão de quem
 * indicou simplesmente não nascia.
 */
export function IndicadoPor({
  holdingId,
  indicadoPorNome,
  onChanged,
}: {
  holdingId: string
  indicadoPorNome: string | null
  onChanged?: () => void
}) {
  const router = useRouter()
  const [state, action] = useActionState<Estado, FormData>(setIndicadoPor, {
    ok: false,
  })
  const [abrir, setAbrir] = React.useState(false)

  React.useEffect(() => {
    if (state.ok) {
      setAbrir(false)
      router.refresh()
      onChanged?.()
    }
  }, [state.ok, state.message, router, onChanged])

  if (indicadoPorNome && !abrir) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2 text-[11px]">
        <HandCoins className="size-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Indicado por</span>
        <span className="font-medium">{indicadoPorNome}</span>
        <span className="text-muted-foreground">
          — comissão apurada quando a fatura é paga
        </span>
        <form action={action} className="contents">
          <input type="hidden" name="holdingId" value={holdingId} />
          <input type="hidden" name="cupom" value="" />
          <button
            type="submit"
            className="ml-auto inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted"
          >
            <X className="size-3" />
            remover
          </button>
        </form>
      </div>
    )
  }

  if (!abrir) {
    return (
      <div className="mt-2 border-t pt-2">
        <button
          type="button"
          onClick={() => setAbrir(true)}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <HandCoins className="size-3.5" />
          Veio por indicação? Informe o cupom
        </button>
      </div>
    )
  }

  return (
    <form action={action} className="mt-2 space-y-1.5 border-t pt-2">
      <input type="hidden" name="holdingId" value={holdingId} />
      <p className="text-[11px] font-medium">Indicado por (cupom)</p>
      <div className="flex items-center gap-1.5">
        <input
          name="cupom"
          autoFocus
          defaultValue=""
          placeholder="ex.: DGFOODS"
          autoCapitalize="characters"
          className="w-40 rounded-md border bg-background px-2 py-1.5 text-[11px] uppercase placeholder:normal-case placeholder:text-muted-foreground/70"
        />
        <Salvar />
        <button
          type="button"
          onClick={() => setAbrir(false)}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          cancelar
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        O dono do cupom passa a receber o percentual dele sobre cada fatura paga
        deste cliente. Acompanhe em Indicações.
      </p>
      {state.error && <p className="text-[11px] text-rose-600">{state.error}</p>}
    </form>
  )
}

function Salvar() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border bg-background px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:bg-muted disabled:opacity-60"
    >
      {pending ? "..." : "Vincular"}
    </button>
  )
}
