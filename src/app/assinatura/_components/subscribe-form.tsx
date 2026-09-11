"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Check, Sparkles, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { fmtBRL } from "@/lib/format"
import type { PlanId, PlanoOption } from "@/lib/data/assinatura"
import {
  CICLOS,
  economiaAnualPct,
  PARCELAS_12X,
  ROTULO_CICLO,
  valorCobranca,
  valorMensalExibido,
  type BillingCycle,
} from "@/lib/pricing"
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
  billingType,
  acrescimo12xPct,
}: {
  planos: PlanoOption[]
  precoCustom: boolean
  customMensalidade: number
  activeUnits: number
  jaTemCliente: boolean
  defaultNome: string
  defaultPlan: PlanId
  /** Forma de cobrança do cliente. "CREDIT_CARD" é o padrão. */
  billingType: string
  /** Acréscimo do anual em 12x (vem do banco — ver @/lib/pricing). */
  acrescimo12xPct: number
}) {
  const [state, action] = useActionState<AssinarState, FormData>(assinar, {
    ok: false,
  })
  const [plan, setPlan] = React.useState<PlanId>(defaultPlan)
  // Ciclo de cobrança (só self-service). Anual à vista é a base; 12x leva o
  // acréscimo; mensal custa +30%.
  const [ciclo, setCiclo] = React.useState<BillingCycle>("anual")
  const regra = { acrescimo12xPct }
  // 12x é parcelamento no cartão: quem fechou em Pix/boleto não vê a opção.
  const ciclosDisponiveis = CICLOS.filter(
    (c) => c !== "anual_12x" || (billingType !== "PIX" && billingType !== "BOLETO"),
  )

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
  // baseTotal = preço-base (anual à vista/mês) × lojas. mesExibido varia com
  // o ciclo (no 12x é a parcela); cobrancaAgora é o total do ciclo (anual =
  // 12× à vista; 12x = 12 parcelas; mensal = +30%).
  const baseTotal = precoCustom ? customMensalidade : (selected?.total ?? 0)
  const mesExibido = precoCustom
    ? baseTotal
    : valorMensalExibido(baseTotal, ciclo, regra)
  const cobrancaAgora = precoCustom
    ? baseTotal
    : valorCobranca(baseTotal, ciclo, regra)
  const eco = economiaAnualPct()

  return (
    <form action={action} className="mt-6 space-y-4 text-left">
      {!precoCustom && (
        <>
          <input type="hidden" name="plano" value={plan} />
          <input type="hidden" name="ciclo" value={ciclo} />

          {/* Os três ciclos. Grade de 3 colunas, e não pílula corrida: no
              cartão estreito do checkout, "Anual à vista" + selo + "Anual em
              12x" + "Mensal" não cabem numa linha só. */}
          <div className="space-y-1.5">
            <div
              role="radiogroup"
              aria-label="Ciclo de cobrança"
              className={`grid gap-1 rounded-xl border bg-background p-1 ${
                ciclosDisponiveis.length === 3 ? "grid-cols-3" : "grid-cols-2"
              }`}
            >
              {ciclosDisponiveis.map((c) => {
                const ativo = ciclo === c
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    onClick={() => setCiclo(c)}
                    className={`flex flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-xs font-medium leading-tight transition-colors ${
                      ativo
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {ROTULO_CICLO[c]}
                    {c === "anual" && (
                      <span
                        className={`rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wide ${
                          ativo
                            ? "bg-primary-foreground/20"
                            : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        economize {eco}%
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <p className="text-center text-[11px] text-muted-foreground">
              {ciclo === "anual"
                ? `1 cobrança à vista no cartão — ${eco}% a menos que o mensal.`
                : ciclo === "anual_12x"
                  ? `O ano em ${PARCELAS_12X} parcelas no cartão. O valor total usa o limite do cartão.`
                  : "Cobrado todo mês. Cancele quando quiser."}
            </p>
          </div>

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
                      {p.id === "ai" && (
                        <Sparkles className="size-3.5 text-amber-500" />
                      )}
                      {p.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {p.desc} · {fmtBRL(p.first)} + {fmtBRL(p.add)}/loja extra
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-right">
                      <span className="block text-sm font-semibold tabular-nums">
                        {fmtBRL(valorMensalExibido(p.total, ciclo, regra))}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        /mês
                        {ciclo === "anual"
                          ? " · à vista"
                          : ciclo === "anual_12x"
                            ? " · 12x"
                            : ""}
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

      {/* Cupom de indicação. Fica RECOLHIDO por padrão: campo de cupom sempre
          visível faz quem não tem um sair da tela pra procurar, e isso derruba
          conversão. Quem tem, clica. */}
      <details className="rounded-lg border bg-muted/30 px-3 py-2">
        <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground hover:text-foreground">
          Tenho um cupom de indicação
        </summary>
        <div className="mt-2.5">
          <input
            id="cupom"
            name="cupom"
            placeholder="Ex.: DGFOODS"
            autoCapitalize="characters"
            className={inputCls}
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            O desconto vale só na primeira mensalidade. Da segunda em diante, o
            valor normal do plano.
          </p>
        </div>
      </details>

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

          {/* Endereço do comprador */}
          <div className="rounded-lg border border-dashed p-3">
            <p className="text-xs font-medium">Endereço</p>
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

      {/* Resumo do que vai ser cobrado — plano escolhido sempre visível */}
      <div className="rounded-xl border bg-muted/30 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Plano escolhido</span>
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            {plan === "pro" && <Zap className="size-3.5 text-amber-500" />}
            {plan === "ai" && <Sparkles className="size-3.5 text-amber-500" />}
            {precoCustom ? "Personalizado" : (selected?.label ?? "—")}
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between border-t pt-1.5">
          <span className="text-xs text-muted-foreground">
            {precoCustom
              ? "Total mensal"
              : ciclo === "anual"
                ? "Cobrança à vista (ano)"
                : ciclo === "anual_12x"
                  ? `${PARCELAS_12X} parcelas no cartão`
                  : "Total mensal"}
          </span>
          <span className="text-base font-bold tabular-nums">
            {!precoCustom && ciclo === "anual_12x" ? (
              <>
                <span className="text-xs font-normal text-muted-foreground">
                  {PARCELAS_12X}x{" "}
                </span>
                {fmtBRL(mesExibido)}
              </>
            ) : (
              <>
                {fmtBRL(cobrancaAgora)}
                <span className="text-xs font-normal text-muted-foreground">
                  {ciclo === "anual" && !precoCustom ? "/ano" : "/mês"}
                </span>
              </>
            )}
          </span>
        </div>
        {!precoCustom && ciclo !== "mensal" && (
          <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{ciclo === "anual" ? "Equivale a" : "Total no ano"}</span>
            <span className="tabular-nums">
              {ciclo === "anual"
                ? `${fmtBRL(mesExibido)}/mês`
                : fmtBRL(cobrancaAgora)}
            </span>
          </div>
        )}
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Check className="size-3 text-emerald-600" strokeWidth={3} />
          {billingType === "PIX"
            ? "Pix · a cobrança chega todo mês no seu e-mail"
            : billingType === "BOLETO"
              ? "Boleto · a cobrança chega todo mês no seu e-mail"
              : billingType === "UNDEFINED"
                ? "Você escolhe como pagar · cancele quando quiser"
                : ciclo === "anual" && !precoCustom
                  ? "Cartão de crédito · 1 cobrança à vista · renova a cada 12 meses"
                  : ciclo === "anual_12x" && !precoCustom
                    ? `Cartão de crédito · ${PARCELAS_12X} parcelas · renova a cada 12 meses`
                    : "Cartão de crédito · renova automático · cancele quando quiser"}
        </p>
      </div>

      {/* O ACEITE. É daqui que nasce o Termo de Adesão: o servidor recusa a
          assinatura sem esta caixa, grava quem aceitou (conta, IP, data) e o
          hash das condições do plano escolhido. O termo com os dados do
          cliente chega por e-mail quando o pagamento confirma. */}
      <label className="flex items-start gap-2.5 rounded-lg border bg-muted/20 px-3 py-2.5 text-[12px] leading-snug text-muted-foreground">
        <input
          type="checkbox"
          name="aceite"
          required
          className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
        />
        <span>
          Li e aceito o{" "}
          <a
            href="/contrato"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground underline underline-offset-2"
          >
            Contrato de Prestação de Serviços
          </a>{" "}
          e os{" "}
          <a
            href="/termos"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground underline underline-offset-2"
          >
            Termos de Uso
          </a>
          . As condições do plano e do ciclo escolhidos formam o meu Termo de
          Adesão, que chega por e-mail quando o pagamento for confirmado.
        </span>
      </label>

      {state.message && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          {state.message}
        </div>
      )}

      <SubmitBtn
        label={
          jaTemCliente
            ? "Ir para o pagamento no cartão"
            : precoCustom
              ? `Assinar por ${fmtBRL(cobrancaAgora)}/mês`
              : ciclo === "anual"
                ? `Assinar o ${selected?.label ?? "plano"} · ${fmtBRL(cobrancaAgora)}/ano à vista`
                : ciclo === "anual_12x"
                  ? `Assinar o ${selected?.label ?? "plano"} · ${PARCELAS_12X}x de ${fmtBRL(mesExibido)}`
                  : `Assinar o ${selected?.label ?? "plano"} · ${fmtBRL(cobrancaAgora)}/mês`
        }
      />

      <p className="text-center text-[11px] text-muted-foreground">
        Pagamento seguro via Asaas ·{" "}
        {billingType === "PIX"
          ? "Pix"
          : billingType === "BOLETO"
            ? "boleto"
            : billingType === "UNDEFINED"
              ? "cartão, Pix ou boleto"
              : "só cartão de crédito"}{" "}
        · cancele quando quiser.
      </p>
    </form>
  )
}
