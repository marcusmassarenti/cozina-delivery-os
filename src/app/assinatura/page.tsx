import { redirect } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  BarChart3,
  Check,
  Clock,
  Sparkles,
  Store,
  Zap,
} from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { getPlanoAtual, type PlanId, type PlanoAtual } from "@/lib/data/assinatura"
import { daysUntil } from "@/lib/data/billing"
import { fmtBRL } from "@/lib/format"

import { SubscribeForm } from "./_components/subscribe-form"
import { CancelButton } from "./_components/cancel-button"
import { PayPendingButton } from "./_components/pay-pending-button"

const BRAND = "oklch(0.65 0.21 35)"
const BRAND_STRONG = "oklch(0.57 0.2 33)"
const BRAND_SOFT = "oklch(0.96 0.035 55)"
const INK = "oklch(0.2 0.01 48)"
const BRAND_BTN =
  "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_-12px_oklch(0.65_0.21_35/.65)] transition-all hover:-translate-y-0.5"

const EMAIL = "mailto:suporte@deliveryos.food"

const FEATS: Record<PlanId, string[]> = {
  essencial: [
    "Upload iFood, 99 e Keeta",
    "Lucro real por loja",
    "Comparação entre plataformas",
    "Histórico mês a mês",
  ],
  pro: [
    "Tudo do Essencial",
    "Fluxo de caixa completo",
    "Importação OFX dos bancos",
    "DRE + todos os módulos",
  ],
  ai: [
    "Tudo do Pro",
    "Diagnóstico inteligente por loja",
    "Plano de ação por IA (3 prioridades/mês)",
    "Exporta o diagnóstico em PDF",
  ],
}

function fmtDataBR(iso: string | null): string {
  if (!iso) return "—"
  return iso.split("-").reverse().join("/")
}

export const dynamic = "force-dynamic"

export default async function AssinaturaPage({
  searchParams,
}: {
  searchParams: Promise<{ plano?: string }>
}) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect("/login")

  const plano = await getPlanoAtual()

  // Assinatura ATIVA → painel de gestão DENTRO do app (aba da Minha conta).
  if (plano?.status === "paid") {
    redirect("/minha-conta/assinatura")
  }

  // Senão → checkout (assinar ou finalizar pagamento).
  const { plano: planoQuery } = await searchParams
  return <Checkout plano={plano} planoQuery={planoQuery} />
}

/* ─────────────────────── CHECKOUT (assinar / pendente) ─────────────────── */

function Checkout({
  plano,
  planoQuery,
}: {
  plano: PlanoAtual | null
  planoQuery?: string
}) {
  const pendentePagamento = !!plano?.subscriptionId
  const diasTrial =
    plano?.status === "trial" && plano.trialEndsAt
      ? Math.max(0, daysUntil(plano.trialEndsAt))
      : null
  const defaultPlan: PlanId =
    planoQuery === "pro"
      ? "pro"
      : planoQuery === "ai"
        ? "ai"
        : planoQuery === "essencial"
          ? "essencial"
          : (plano?.selectedPlan ?? "essencial")

  return (
    <div className="min-h-screen w-full lg:grid lg:grid-cols-[1.05fr_minmax(0,560px)]">
      {/* Painel lateral: prévia do sistema + planos */}
      <aside
        className="relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex xl:p-14"
        style={{ background: INK }}
      >
        <div
          className="pointer-events-none absolute -right-20 top-10 h-96 w-96 rounded-full blur-3xl"
          style={{ background: "oklch(0.65 0.21 35 / 0.22)" }}
        />

        <div className="relative flex items-center gap-2.5">
          <span
            className="flex size-10 items-center justify-center rounded-xl text-white"
            style={{ background: BRAND }}
          >
            <BarChart3 className="size-6" strokeWidth={2.4} />
          </span>
          <span className="text-xl font-medium tracking-tight">Delivery OS</span>
        </div>

        <div className="relative">
          <p
            className="mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: "oklch(0.65 0.21 35 / 0.18)", color: "#ffb59c" }}
          >
            <Sparkles className="size-3.5" />
            Falta pouco pra você ter o controle total
          </p>
          <h2 className="max-w-lg text-3xl font-semibold leading-[1.15] xl:text-4xl">
            Toda a sua operação num painel só.
          </h2>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/60">
            iFood, 99 Food e Keeta — pedidos, financeiro, avaliações e DRE
            consolidados, em tempo real.
          </p>

          {/* Mini prévia do sistema */}
          <div className="mt-7 max-w-lg rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-white/70">
                Painel · sua loja
              </span>
              <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                ao vivo
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2.5">
              {[
                { l: "Pedidos", v: "1.284" },
                { l: "Faturamento", v: "R$ 92k" },
                { l: "Lucro", v: "R$ 18k" },
              ].map((k) => (
                <div key={k.l} className="rounded-lg bg-white/[0.05] p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-white/45">
                    {k.l}
                  </p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums">
                    {k.v}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex h-16 items-end gap-1.5">
              {[40, 62, 48, 78, 55, 88, 70].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t"
                  style={{ height: `${h}%`, background: BRAND }}
                />
              ))}
            </div>
          </div>

          {/* O que cada plano tem */}
          <div className="mt-7 grid max-w-lg gap-3 sm:grid-cols-2">
            {(plano?.planos ?? []).map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-base font-semibold">
                    {p.id === "pro" && (
                      <Zap className="size-4 text-amber-400" />
                    )}
                    {p.id === "ai" && (
                      <Sparkles className="size-4 text-amber-400" />
                    )}
                    {p.label}
                  </span>
                  <span className="text-sm font-semibold text-white/75">
                    {fmtBRL(p.perUnit)}
                    <span className="text-xs font-normal text-white/40">
                      /loja
                    </span>
                  </span>
                </div>
                <ul className="mt-2.5 space-y-1.5">
                  {FEATS[p.id].map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-[13px] text-white/70"
                    >
                      <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[13px] text-white/40">
          Pagamento seguro via Asaas · cartão de crédito · cancele quando quiser.
        </p>
      </aside>

      {/* Coluna do formulário */}
      <main className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-muted/20 p-6 sm:p-10">
        <div
          className="pointer-events-none absolute left-1/2 top-1/4 h-72 w-96 -translate-x-1/2 rounded-full blur-3xl lg:hidden"
          style={{ background: "oklch(0.65 0.21 35 / 0.12)" }}
        />

        <div className="relative mx-auto w-full max-w-md">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <span
              className="flex size-9 items-center justify-center rounded-xl text-white"
              style={{ background: BRAND }}
            >
              <BarChart3 className="size-5" strokeWidth={2.4} />
            </span>
            <span className="text-lg font-medium tracking-tight">
              Delivery OS
            </span>
          </div>

          <div className="rounded-2xl border bg-card p-6 shadow-xl sm:p-8">
            <div className="text-center">
              <div
                className="mx-auto flex size-14 items-center justify-center rounded-2xl"
                style={{ background: BRAND_SOFT, color: BRAND_STRONG }}
              >
                {pendentePagamento ? (
                  <Clock className="size-7" />
                ) : (
                  <Sparkles className="size-7" />
                )}
              </div>
              <h1 className="mt-4 text-2xl font-semibold">
                {pendentePagamento ? "Falta pagar" : "Assine o Delivery OS"}
              </h1>
            </div>

            {pendentePagamento && plano ? (
              <>
                <p className="mt-2 text-center text-[15px] text-muted-foreground">
                  Sua assinatura foi criada, mas o{" "}
                  <b className="text-foreground">pagamento ainda não foi feito</b>
                  . Finalize aqui —{" "}
                  <b className="text-foreground">não precisa refazer</b> o
                  cadastro.
                </p>
                <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                  ⏳ Cobrança gerada — falta só o pagamento no cartão.
                </div>
                <PlanBox plano={plano} />
                <div className="mt-6">
                  <PayPendingButton />
                </div>
                <CancelButton fimPeriodo={plano.dueDate} />
              </>
            ) : plano ? (
              <>
                <p className="mt-2 text-center text-[15px] leading-relaxed text-muted-foreground">
                  <b className="text-foreground">
                    Falta pouco pra ter o controle total do seu delivery.
                  </b>
                  <br />
                  {diasTrial === 0
                    ? "Seu teste termina hoje — assine e não perca o acesso."
                    : diasTrial != null
                      ? `Você ainda tem ${diasTrial} dia${diasTrial === 1 ? "" : "s"} de teste — garanta seu acesso agora.`
                      : "Continue com o lucro real sempre à mão."}
                </p>
                {plano.precoCustom && (
                  <div className="mt-6 rounded-xl border bg-muted/30 p-4">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-medium">Plano mensal</span>
                      <span className="text-2xl font-semibold tabular-nums">
                        {fmtBRL(plano.mensalidade)}
                        <span className="text-sm font-normal text-muted-foreground">
                          /mês
                        </span>
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <Store className="size-3.5" />
                      {plano.activeUnits} loja
                      {plano.activeUnits === 1 ? "" : "s"} ativa
                      {plano.activeUnits === 1 ? "" : "s"} · preço combinado
                    </div>
                  </div>
                )}
                <SubscribeForm
                  planos={plano.planos}
                  precoCustom={plano.precoCustom}
                  customMensalidade={plano.mensalidade}
                  activeUnits={plano.activeUnits}
                  jaTemCliente={!!plano.customerId}
                  defaultNome={plano.name}
                  defaultPlan={defaultPlan}
                />
              </>
            ) : (
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Não foi possível carregar seu plano agora. Fale com o suporte:{" "}
                <a href={EMAIL} className="underline hover:text-foreground">
                  suporte@deliveryos.food
                </a>
              </p>
            )}
          </div>

          <div className="mt-6 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              Voltar
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

function PlanBox({ plano }: { plano: PlanoAtual }) {
  return (
    <div className="mt-6 space-y-2 rounded-xl border bg-muted/30 p-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Plano</span>
        <span className="font-medium">{plano.planLabel ?? "—"}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Valor</span>
        <span className="font-medium tabular-nums">
          {fmtBRL(plano.mensalidade)}/mês
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Próxima cobrança</span>
        <span className="font-medium tabular-nums">
          {fmtDataBR(plano.dueDate)}
        </span>
      </div>
    </div>
  )
}
