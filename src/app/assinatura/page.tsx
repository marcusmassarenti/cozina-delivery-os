import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, Sparkles, Store } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { getPlanoAtual, type PlanId } from "@/lib/data/assinatura"
import { daysUntil } from "@/lib/data/billing"
import { fmtBRL } from "@/lib/format"

import { SubscribeForm } from "./_components/subscribe-form"
import { CancelButton } from "./_components/cancel-button"

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        <div className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
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

            <Link
              href="/"
              className="btn-brand mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold"
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
