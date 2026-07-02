import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, BarChart3, CheckCircle2, Sparkles, Store } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { getPlanoAtual, type PlanId } from "@/lib/data/assinatura"
import { daysUntil } from "@/lib/data/billing"
import { fmtBRL } from "@/lib/format"

import { SubscribeForm } from "./_components/subscribe-form"
import { CancelButton } from "./_components/cancel-button"

// Cores da marca Delivery OS (mesmas da landing).
const BRAND = "oklch(0.65 0.21 35)"
const BRAND_STRONG = "oklch(0.57 0.2 33)"
const BRAND_SOFT = "oklch(0.96 0.035 55)"
/** Botão principal na cor da marca (o btn-brand só existe na landing). */
const BRAND_BTN =
  "inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_-12px_oklch(0.65_0.21_35/.65)] transition-all hover:-translate-y-0.5"

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

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-muted/30 p-6">
      {/* Glow da marca no fundo */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 h-80 w-[28rem] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: "oklch(0.65 0.21 35 / 0.14)" }}
      />

      {/* Logo Delivery OS */}
      <div className="relative z-10 mb-6 flex items-center gap-2">
        <span
          className="flex size-9 items-center justify-center rounded-xl text-white shadow-[0_8px_20px_-8px_oklch(0.65_0.21_35/.8)]"
          style={{ background: BRAND }}
        >
          <BarChart3 className="size-5" strokeWidth={2.4} />
        </span>
        <span className="text-lg font-medium tracking-tight">Delivery OS</span>
      </div>

      <div className="relative z-10 w-full max-w-md rounded-2xl border bg-card p-8 shadow-xl">
        <div className="text-center">
          <div
            className="mx-auto flex size-14 items-center justify-center rounded-2xl"
            style={{ background: BRAND_SOFT, color: BRAND_STRONG }}
          >
            {jaAtivo ? (
              <CheckCircle2 className="size-7" />
            ) : (
              <Sparkles className="size-7" />
            )}
          </div>
          <h1 className="mt-4 text-xl font-semibold">
            {jaAtivo ? "Assinatura ativa" : "Assine o Delivery OS"}
          </h1>
        </div>

        {jaAtivo ? (
          <>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Sua assinatura está em dia. Obrigado por fazer parte! 🎉
            </p>

            <div className="mt-6 space-y-2 rounded-xl border bg-muted/30 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Plano</span>
                <span className="font-medium">
                  {plano?.planLabel ?? "—"}
                </span>
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
                <span className="font-medium">
                  {plano?.paymentMethod ?? "Asaas"}
                </span>
              </div>
            </div>

            {/* Histórico de pagamentos */}
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
                      <span className="tabular-nums">{fmtDataBR(p.paidOn)}</span>
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
                  {plano.activeUnits} loja{plano.activeUnits === 1 ? "" : "s"}{" "}
                  ativa{plano.activeUnits === 1 ? "" : "s"} · preço combinado
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
            {plano.subscriptionId && (
              <div className="mt-4 border-t pt-4">
                <p className="text-center text-[11px] text-muted-foreground">
                  Você já tem uma assinatura ativa (com pendência).
                </p>
                <CancelButton fimPeriodo={plano.dueDate} />
              </div>
            )}
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
    </div>
  )
}
