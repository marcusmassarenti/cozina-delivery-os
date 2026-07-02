"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Check, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { fmtBRL } from "@/lib/format"
import type { PlanId, PlanoOption } from "@/lib/data/assinatura"
import { assinar, type AssinarState } from "../_actions"

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Gerando pagamento..." : label}
    </Button>
  )
}

export function SubscribeForm({
  planos,
  precoCustom,
  customMensalidade,
  activeUnits,
  jaTemCliente,
  defaultNome,
  defaultPlan,
}: {
  planos: PlanoOption[]
  precoCustom: boolean
  customMensalidade: number
  activeUnits: number
  jaTemCliente: boolean
  defaultNome: string
  defaultPlan: PlanId
}) {
  const [state, action] = useActionState<AssinarState, FormData>(assinar, {
    ok: false,
  })
  const [plan, setPlan] = React.useState<PlanId>(defaultPlan)

  // Endereço (pra Nota Fiscal) — CEP autopreenche o resto via ViaCEP.
  const [cep, setCep] = React.useState("")
  const [logradouro, setLogradouro] = React.useState("")
  const [bairro, setBairro] = React.useState("")
  const [cidadeUf, setCidadeUf] = React.useState("")
  const [cepMsg, setCepMsg] = React.useState<string | null>(null)
  const [buscandoCep, setBuscandoCep] = React.useState(false)

  React.useEffect(() => {
    if (state.ok && state.checkoutUrl) window.location.href = state.checkoutUrl
  }, [state])

  async function buscarCep(valor: string) {
    const digits = valor.replace(/\D/g, "")
    if (digits.length !== 8) return
    setBuscandoCep(true)
    setCepMsg(null)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await res.json()
      if (data.erro) {
        setCepMsg("CEP não encontrado.")
        return
      }
      setLogradouro(data.logradouro ?? "")
      setBairro(data.bairro ?? "")
      setCidadeUf(
        [data.localidade, data.uf].filter(Boolean).join(" - ") || "",
      )
    } catch {
      setCepMsg("Não deu pra buscar o CEP — preencha o endereço manualmente.")
    } finally {
      setBuscandoCep(false)
    }
  }

  const inputCls =
    "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"

  const selected = planos.find((p) => p.id === plan)
  const total = precoCustom ? customMensalidade : (selected?.total ?? 0)

  return (
    <form action={action} className="mt-6 space-y-4 text-left">
      {!precoCustom && (
        <>
          <input type="hidden" name="plano" value={plan} />
          <div className="space-y-2">
            {planos.map((p) => {
              const active = p.id === plan
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setPlan(p.id)}
                  className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition-colors ${
                    active
                      ? "border-[var(--brand,theme(colors.violet.500))] ring-2 ring-violet-500/30"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <span>
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {p.id === "pro" && (
                        <Zap className="size-3.5 text-amber-500" />
                      )}
                      {p.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {p.desc} · {fmtBRL(p.perUnit)}/loja
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-right">
                      <span className="block text-sm font-semibold tabular-nums">
                        {fmtBRL(p.total)}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        /mês
                      </span>
                    </span>
                    <span
                      className={`flex size-4 items-center justify-center rounded-full border ${
                        active
                          ? "border-violet-500 bg-violet-500 text-white"
                          : "border-muted-foreground/40"
                      }`}
                    >
                      {active && <Check className="size-3" strokeWidth={3} />}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {activeUnits} loja{activeUnits === 1 ? "" : "s"} ativa
            {activeUnits === 1 ? "" : "s"} · o valor acompanha o nº de lojas.
          </p>
        </>
      )}

      {!jaTemCliente && (
        <>
          <div>
            <label htmlFor="nome" className="text-xs font-medium">
              Nome do responsável ou razão social
            </label>
            <input
              id="nome"
              name="nome"
              defaultValue={defaultNome}
              required
              minLength={2}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="cpfCnpj" className="text-xs font-medium">
              CPF ou CNPJ
            </label>
            <input
              id="cpfCnpj"
              name="cpfCnpj"
              required
              inputMode="numeric"
              placeholder="Só os números"
              className={inputCls}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Necessário pra emitir a cobrança e a nota.
            </p>
          </div>

          {/* Endereço — pra emissão de Nota Fiscal */}
          <div className="rounded-lg border border-dashed p-3">
            <p className="text-xs font-medium">Endereço (para nota fiscal)</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label htmlFor="cep" className="text-[11px] font-medium">
                  CEP
                </label>
                <input
                  id="cep"
                  name="cep"
                  value={cep}
                  onChange={(e) => setCep(e.target.value)}
                  onBlur={(e) => buscarCep(e.target.value)}
                  required
                  inputMode="numeric"
                  placeholder="00000-000"
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="numero" className="text-[11px] font-medium">
                  Número
                </label>
                <input
                  id="numero"
                  name="numero"
                  required
                  inputMode="numeric"
                  placeholder="123"
                  className={inputCls}
                />
              </div>
            </div>
            {(buscandoCep || cepMsg) && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {buscandoCep ? "Buscando CEP..." : cepMsg}
              </p>
            )}
            <div className="mt-2">
              <label htmlFor="logradouro" className="text-[11px] font-medium">
                Rua / logradouro
              </label>
              <input
                id="logradouro"
                name="logradouro"
                value={logradouro}
                onChange={(e) => setLogradouro(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="bairro" className="text-[11px] font-medium">
                  Bairro
                </label>
                <input
                  id="bairro"
                  name="bairro"
                  value={bairro}
                  onChange={(e) => setBairro(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="complemento" className="text-[11px] font-medium">
                  Complemento
                </label>
                <input
                  id="complemento"
                  name="complemento"
                  placeholder="opcional"
                  className={inputCls}
                />
              </div>
            </div>
            {cidadeUf && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Cidade: <b className="text-foreground">{cidadeUf}</b>
              </p>
            )}
            <div className="mt-2">
              <label htmlFor="telefone" className="text-[11px] font-medium">
                Telefone / WhatsApp
              </label>
              <input
                id="telefone"
                name="telefone"
                inputMode="numeric"
                placeholder="(00) 00000-0000"
                className={inputCls}
              />
            </div>
          </div>
        </>
      )}

      {state.message && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          {state.message}
        </div>
      )}

      <SubmitBtn
        label={
          jaTemCliente
            ? "Ir para o pagamento"
            : `Assinar por ${fmtBRL(total)}/mês`
        }
      />

      <p className="text-center text-[11px] text-muted-foreground">
        Pagamento seguro via Asaas · cartão de crédito (renova automático) ·
        cancele quando quiser.
      </p>
    </form>
  )
}
