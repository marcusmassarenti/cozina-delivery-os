"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Percent, Tag } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fmtBRL } from "@/lib/format"

import { setDescontoNegociado } from "../_actions"

type Estado = { ok: boolean; message?: string; error?: string }

/**
 * O desconto que a gente COMBINA com o cliente — as três formas num controle.
 *
 * ── POR QUE (Marcus, 21/08/26) ───────────────────────────────────────────
 * O campo "Cupom" que existia não servia: ele só aceita cupom de INDICAÇÃO de
 * outro cliente, o percentual é definido por quem indicou, e vale uma vez só.
 * Não dava pra fechar uma venda com "20% permanente" nem "50% nos 3 primeiros
 * meses" — que é exatamente o que acontece numa negociação.
 *
 * As três formas saem da combinação de dois campos, em vez de três controles
 * separados que fariam a pessoa escolher o modelo antes de saber o que quer:
 *   • 20 + %      + sem prazo  → 20% enquanto for cliente
 *   • 50 + R$     + sem prazo  → R$ 50 abatidos todo mês
 *   • 50 + %      + 30/11/26   → metade do preço até novembro
 *
 * ⚠️ É DESCONTO, NÃO PREÇO. Incide sobre o valor do plano, então continua
 * acompanhando o cliente quando ele abre ou fecha loja. Pra congelar o valor
 * ignorando o crescimento, o caminho é a mensalidade fixa no "Editar".
 */
export function DescontoNegociado({
  holdingId,
  tipo,
  valor,
  ate,
  nota,
  mensalCheio,
}: {
  holdingId: string
  tipo: "percentual" | "valor" | null
  valor: number | null
  ate: string | null
  nota: string | null
  /** Valor do plano antes do desconto — pra mostrar o efeito na hora. */
  mensalCheio: number | null
}) {
  const [aberto, setAberto] = React.useState(false)
  const [state, action] = useActionState<Estado, FormData>(
    setDescontoNegociado,
    { ok: false },
  )
  const [tipoSel, setTipoSel] = React.useState(tipo ?? "percentual")
  const [valorSel, setValorSel] = React.useState(
    valor != null ? String(valor).replace(".", ",") : "",
  )

  React.useEffect(() => {
    if (state.ok) setAberto(false)
  }, [state.ok])

  const vigente =
    tipo != null && valor != null && (!ate || ate >= new Date().toISOString().slice(0, 10))

  // Prévia do efeito, calculada enquanto digita: ver "de R$ 245 por R$ 196"
  // antes de salvar evita o erro clássico de trocar % por reais.
  const previa = (() => {
    const n = Number(valorSel.replace(/\./g, "").replace(",", "."))
    if (!mensalCheio || !Number.isFinite(n) || n <= 0) return null
    const novo =
      tipoSel === "percentual"
        ? Math.round(mensalCheio * (100 - n)) / 100
        : Math.round((mensalCheio - n) * 100) / 100
    return novo < 0 ? 0 : novo
  })()

  return (
    <div className="mt-2 border-t pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <Tag className="size-3.5 shrink-0 text-muted-foreground" />
        {vigente ? (
          <p className="text-xs">
            <b>
              {tipo === "percentual"
                ? `${valor}% de desconto`
                : `${fmtBRL(valor ?? 0)} de abatimento`}
            </b>
            <span className="text-muted-foreground">
              {ate
                ? ` até ${ate.split("-").reverse().join("/")}`
                : " · sem prazo"}
              {nota ? ` · ${nota}` : ""}
            </span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Sem desconto negociado</p>
        )}
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="ml-auto rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
        >
          {aberto ? "Fechar" : vigente ? "Alterar" : "Dar desconto"}
        </button>
      </div>

      {state.error && (
        <p className="mt-1.5 text-xs text-destructive">{state.error}</p>
      )}
      {state.ok && state.message && (
        <p className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-400">
          {state.message}
        </p>
      )}

      {aberto && (
        <form action={action} className="mt-2 rounded-lg border bg-muted/30 p-3">
          <input type="hidden" name="holdingId" value={holdingId} />

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Desconto
              </span>
              <div className="flex items-center gap-1">
                <Input
                  name="descontoValor"
                  value={valorSel}
                  onChange={(e) => setValorSel(e.target.value)}
                  placeholder="20"
                  inputMode="decimal"
                  className="h-8 w-24 text-sm"
                />
                {/* Dois botões em vez de select: a escolha entre % e R$ é a que
                    mais gera engano aqui, e ver os dois lado a lado impede
                    salvar "50" achando que é metade quando são 50 reais. */}
                <div className="flex overflow-hidden rounded-md border">
                  {(["percentual", "valor"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTipoSel(t)}
                      className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        tipoSel === t
                          ? "bg-primary text-primary-foreground"
                          : "bg-background hover:bg-muted"
                      }`}
                    >
                      {t === "percentual" ? "%" : "R$"}
                    </button>
                  ))}
                </div>
                <input type="hidden" name="descontoTipo" value={tipoSel} />
              </div>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Até quando
              </span>
              <Input
                type="date"
                name="descontoAte"
                defaultValue={ate ?? ""}
                className="h-8 w-40 text-sm"
              />
            </label>

            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Motivo (o cliente vê na fatura)
              </span>
              <Input
                name="descontoNota"
                defaultValue={nota ?? ""}
                placeholder="Ex.: negociado no fechamento"
                className="h-8 text-sm"
              />
            </label>
          </div>

          <p className="mt-2 text-[11px] text-muted-foreground">
            Sem data = vale enquanto ele for cliente.
            {previa != null && mensalCheio != null && (
              <>
                {" "}Ficaria <b className="text-foreground">{fmtBRL(previa)}/mês</b>{" "}
                em vez de {fmtBRL(mensalCheio)}.
              </>
            )}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Salvar />
            {vigente && (
              <button
                type="submit"
                name="descontoTipo"
                value=""
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                tirar o desconto
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  )
}

function Salvar() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Percent className="size-3.5" />
      {pending ? "Salvando..." : "Aplicar desconto"}
    </Button>
  )
}
