"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Briefcase } from "lucide-react"

import { toggleCarteira, type BillingActionState } from "../_actions"

/**
 * Liberar o painel da Carteira pra um cliente.
 *
 * Só aparece pra quem é Consultoria — e quando não é, a caixa explica O QUE
 * FAZER em vez de simplesmente sumir. Controle que desaparece sem dizer por
 * quê vira um chamado de suporte ("cadê o botão que você me mostrou?").
 */
export function CarteiraToggle({
  holdingId,
  habilitada,
  ehConsultoria,
}: {
  holdingId: string
  habilitada: boolean
  ehConsultoria: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)

  async function alternar() {
    setBusy(true)
    setErro(null)
    const fd = new FormData()
    fd.set("holdingId", holdingId)
    fd.set("acao", habilitada ? "encerrar" : "liberar")
    try {
      const res: BillingActionState = await toggleCarteira({ ok: false }, fd)
      if (res.ok) router.refresh()
      else setErro(res.message ?? "Não deu certo.")
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao mudar o acesso.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <Briefcase className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Painel da Carteira</h3>
        {habilitada && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            liberado
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        As oito telas de quem administra carteira de lojas: gestores,
        onboarding, atendimentos, comercial e o financeiro da agência.
      </p>

      {!ehConsultoria ? (
        <p className="rounded-md bg-muted px-2.5 py-2 text-[11px] text-muted-foreground">
          Disponível só para cliente do tipo <strong>Consultoria</strong>. Ajuste
          o tipo de estabelecimento na edição do cadastro para liberar.
        </p>
      ) : (
        <div>
          <button
            type="button"
            onClick={alternar}
            disabled={busy}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
              habilitada
                ? "hover:bg-muted"
                : "border-primary bg-primary text-primary-foreground hover:opacity-90"
            }`}
          >
            {busy
              ? "Salvando…"
              : habilitada
                ? "Tirar o acesso"
                : "Liberar para este cliente"}
          </button>
        </div>
      )}
      {erro && <p className="text-[11px] text-rose-600">{erro}</p>}
    </div>
  )
}
