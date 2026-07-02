import { redirect } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  BarChart3,
  Check,
  CheckCircle2,
  Clock,
  Sparkles,
  Store,
  Zap,
} from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { getPlanoAtual, type PlanId } from "@/lib/data/assinatura"
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
  "inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_-12px_oklch(0.65_0.21_35/.65)] transition-all hover:-translate-y-0.5"

/** O que cada plano inclui — mostrado no painel lateral. */
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
  const jaAtivo = plano?.status === "paid"
  // Tem assinatura criada mas ainda não pagou → falta só pagar (não recriar).
  const pendentePagamento = !jaAtivo && !!plano?.subscriptionId
  const diasTrial =
    plano?.status === "trial" && plano.trialEndsAt
      ? Math.max(0, daysUntil(plano.trialEndsAt))
      : null

  const { plano: planoQuery } = await searchParams
  const defaultPlan: PlanId =
    planoQuery === "pro"
      ? "pro"
      : planoQuery === "essencial"
        ? "essencial"
        : (plano?.selectedPlan ?? "essencial")

  const header = jaAtivo
    ? { icon: <CheckCircle2 className="size-7" />, title: "Assinatura ativa" }
    : pendentePagamento
      ? { icon: <Clock className="size-7" />, title: "Falta pagar" }
      : { icon: <Sparkles className="size-7" />, title: "Assine o Delivery OS" }

  return (
    <div className="min-h-screen w-full lg:grid lg:grid-cols-[1.05fr_minmax(0,540px)]">
      {/* ───────── Painel lateral (prévia do sistema + planos) ───────── */}
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
            className="flex size-9 items-center justify-center rounded-xl text-white"
            style={{ background: BRAND }}
          >
            <BarChart3 className="size-5" strokeWidth={2.4} />
          </span>
          <span className="text-lg font-medium tracking-tight">Delivery OS</span>
        </div>

        <div className="relative">
          <h2 className="max-w-md text-2xl font-semibold leading-tight xl:text-[28px]">
            Toda a sua operação num painel só.
          </h2>
          <p className="mt-2.5 max-w-sm text-sm leading-relaxed text-white/55">
            iFood, 99 Food e Keeta — pedidos, financeiro, avaliações e DRE
            consolidados, em tempo real.
          </p>

          {/* Mini prévia do sistema */}
          <div className="mt-6 max-w-md rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-white/70">
                Painel · sua loja
              </span>
              <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                ao vivo
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { l: "Pedidos", v: "1.284" },
                { l: "Faturamento", v: "R$ 92k" },
                { l: "Lucro", v: "R$ 18k" },
              ].map((k) => (
                <div key={k.l} className="rounded-lg bg-white/[0.05] p-2">
                  <p className="text-[9px] uppercase tracking-wide text-white/45">
                    {k.l}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums">
                    {k.v}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex h-14 items-end gap-1.5">
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
          <div className="mt-6 grid max-w-md gap-3 sm:grid-cols-2">
            {(plano?.planos ?? []).map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {p.id === "pro" && (
                      <Zap className="size-3.5 text-amber-400" />
                    )}
                    {p.label}
                  </span>
                  <span className="text-xs font-medium text-white/60">
                    {fmtBRL(p.perUnit)}
                    <span className="text-white/35">/loja</span>
                  </span>
                </div>
                <ul className="mt-2 space-y-1">
                  {FEATS[p.id].map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-1.5 text-[11px] text-white/65"
                    >
                      <Check className="mt-0.5 size-3 shrink-0 text-emerald-400" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-white/40">
          Pagamento seguro via Asaas · cartão de crédito · cancele quando quiser.
        </p>
      </aside>

      {/* ───────── Coluna do formulário / estados ───────── */}
      <main className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-muted/20 p-6 sm:p-10">
        <div
          className="pointer-events-none absolute left-1/2 top-1/4 h-72 w-96 -translate-x-1/2 rounded-full blur-3xl lg:hidden"
          style={{ background: "oklch(0.65 0.21 35 / 0.12)" }}
        />

        <div className="relative mx-auto w-full max-w-md">
          {/* Logo (só no mobile — no desktop está no painel lateral) */}
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
                {header.icon}
              </div>
              <h1 className="mt-4 text-xl font-semibold">{header.title}</h1>
            </div>

            {jaAtivo ? (
              <>
                <p className="mt-2 text-center text-sm text-muted-foreground">
                  Sua assinatura está em dia. Obrigado por fazer parte! 🎉
                </p>
                <PlanBox plano={plano} />
                {plano && plano.payments.length > 0 && (
                  <div className="mt-4 rounded-xl border bg-card p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Histórico de pagamentos
                    </p>
                    <div className="mt-2 divide-y">
                      {plano.payments.map((p, i) => (
                        <div
                          key={`${p.paidOn}-${i}`}
                          className="flex items-center justify-between py-2 text-sm"
                        >
                          <span className="tabular-nums">
                            {fmtDataBR(p.paidOn)}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {p.method ?? "—"}
                          </span>
                          <span className="font-medium tabular-nums">
                            {fmtBRL(p.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <Link
                  href="/"
                  className={`${BRAND_BTN} mt-6`}
                  style={{ background: BRAND }}
                >
                  Voltar pro sistema
                </Link>
                {plano?.subscriptionId && (
                  <CancelButton fimPeriodo={plano.dueDate} />
                )}
              </>
            ) : pendentePagamento && plano ? (
              <>
                <p className="mt-2 text-center text-sm text-muted-foreground">
                  Sua assinatura foi criada, mas o{" "}
                  <b className="text-foreground">pagamento ainda não foi feito</b>
                  . Finalize aqui pra ativar —{" "}
                  <b className="text-foreground">não precisa refazer</b> o
                  cadastro.
                </p>
                <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
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
                <p className="mt-2 text-center text-sm text-muted-foreground">
                  {diasTrial === 0
                    ? "Seu teste grátis termina hoje. Continue com tudo funcionando."
                    : diasTrial != null
                      ? `Você ainda tem ${diasTrial} dia${diasTrial === 1 ? "" : "s"} de teste — assine agora e não perca o acesso.`
                      : "Continue com o lucro real da sua operação sempre à mão."}
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
                <a
                  href="mailto:suporte@deliveryos.food"
                  className="underline hover:text-foreground"
                >
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

/** Resumo do plano (plano, valor, próxima cobrança, pagamento). */
function PlanBox({
  plano,
}: {
  plano: Awaited<ReturnType<typeof getPlanoAtual>>
}) {
  return (
    <div className="mt-6 space-y-2 rounded-xl border bg-muted/30 p-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Plano</span>
        <span className="font-medium">{plano?.planLabel ?? "—"}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Valor</span>
        <span className="font-medium tabular-nums">
          {plano ? `${fmtBRL(plano.mensalidade)}/mês` : "—"}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Próxima cobrança</span>
        <span className="font-medium tabular-nums">
          {fmtDataBR(plano?.dueDate ?? null)}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Pagamento</span>
        <span className="font-medium">{plano?.paymentMethod ?? "Asaas"}</span>
      </div>
    </div>
  )
}
