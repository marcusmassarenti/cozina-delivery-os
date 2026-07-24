"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { Check, Star, Wallet } from "lucide-react"

import { setAppHabilitado, type AppHabilitadoState } from "../_actions"

/**
 * Os dois selos de "OK do admin" por loja: app Financeiro e app de Avaliações.
 *
 * O vínculo do merchant é único, mas cada app é autorizado separadamente pelo
 * lojista no Portal do Parceiro. Clicar aqui é o passo final do processo
 * (cliente manda CNPJ → vinculamos → ele autoriza os 2 apps → confirmamos).
 * Habilitar avaliações é o que faz a Importação parar de cobrar a planilha.
 */
export function AppToggles({
  unitId,
  finOn,
  reviewOn,
}: {
  unitId: string
  finOn: boolean
  reviewOn: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <SeloApp
        unitId={unitId}
        app="financeiro"
        rotulo="Financeiro"
        icone={<Wallet className="size-3" />}
        ligado={finOn}
      />
      <SeloApp
        unitId={unitId}
        app="avaliacoes"
        rotulo="Avaliações"
        icone={<Star className="size-3" />}
        ligado={reviewOn}
      />
    </div>
  )
}

function SeloApp({
  unitId,
  app,
  rotulo,
  icone,
  ligado,
}: {
  unitId: string
  app: "financeiro" | "avaliacoes"
  rotulo: string
  icone: React.ReactNode
  ligado: boolean
}) {
  const router = useRouter()
  const [state, action] = useActionState<AppHabilitadoState, FormData>(
    setAppHabilitado,
    { ok: false },
  )

  // Padrão do projeto: sucesso → refresh pra o selo refletir o novo estado.
  React.useEffect(() => {
    if (state.ok) router.refresh()
  }, [state.ok, router])

  return (
    <form action={action} className="contents">
      <input type="hidden" name="unitId" value={unitId} />
      <input type="hidden" name="app" value={app} />
      {/* Clicar alterna: ligado → desliga, desligado → liga. */}
      <input type="hidden" name="ligar" value={ligado ? "0" : "1"} />
      <Botao rotulo={rotulo} icone={icone} ligado={ligado} />
      {state.error && (
        <span className="text-[10px] text-rose-600" title={state.error}>
          erro
        </span>
      )}
    </form>
  )
}

function Botao({
  rotulo,
  icone,
  ligado,
}: {
  rotulo: string
  icone: React.ReactNode
  ligado: boolean
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      title={
        ligado
          ? `App ${rotulo} habilitado — clique pra desfazer`
          : `Marcar o app ${rotulo} como habilitado (o lojista já autorizou no portal)`
      }
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition disabled:opacity-50 ${
        ligado
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400"
          : "border-dashed text-muted-foreground hover:bg-muted"
      }`}
    >
      {ligado ? <Check className="size-3" /> : icone}
      {rotulo}
    </button>
  )
}
