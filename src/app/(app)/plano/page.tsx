import { redirect } from "next/navigation"
import {
  Clock,
  CreditCard,
  Download,
  Mail,
  MessageCircle,
  Store,
  Wallet,
} from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { getPlanoAtual } from "@/lib/data/assinatura"
import { asaasListInvoices } from "@/lib/asaas/client"
import { fmtBRL } from "@/lib/format"
import { CancelButton } from "@/app/assinatura/_components/cancel-button"

export const dynamic = "force-dynamic"

const WHATSAPP = "https://wa.me/5511995125139"
const EMAIL = "mailto:suporte@deliveryos.food"

/** Status da NF no Asaas → texto pro lojista. Só AUTHORIZED tem PDF/XML. */
const NF_STATUS: Record<string, string> = {
  SCHEDULED: "agendada",
  SYNCHRONIZED: "processando",
  AUTHORIZED: "autorizada",
  PROCESSING_CANCELLATION: "cancelando",
  CANCELED: "cancelada",
  CANCELLATION_DENIED: "cancelamento negado",
  ERROR: "erro na emissão",
}

function fmtDataBR(iso: string | null): string {
  if (!iso) return "—"
  return iso.split("-").reverse().join("/")
}

/**
 * Painel de gestão da assinatura — DENTRO do app (com sidebar/menu). Só pra
 * quem tem assinatura ATIVA; sem assinatura, manda pro checkout /assinatura.
 */
export default async function PlanoPage() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect("/login")

  const plano = await getPlanoAtual()
  if (!plano || plano.status !== "paid") redirect("/assinatura")

  // Notas fiscais emitidas pelo Asaas. Falha "de leve" (lista vazia) se o
  // módulo de NF não estiver configurado — a tela nunca quebra por isso.
  const notas = plano.customerId
    ? await asaasListInvoices(plano.customerId)
    : []

  const valorBRL = fmtBRL(plano.mensalidade)

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      {/* Título */}
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {plano.planLabel ? `Plano ${plano.planLabel}` : "Sua assinatura"}
          </h1>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Ativa
          </span>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Seu plano atual · acompanhe e controle seus gastos aqui.
        </p>
      </div>

      {/* Cards de resumo */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard
          icon={<Wallet className="size-4" />}
          label="Valor mensal"
          value={valorBRL}
          sub="por mês"
        />
        <InfoCard
          icon={<Clock className="size-4" />}
          label="Próxima cobrança"
          value={fmtDataBR(plano.dueDate)}
          sub={valorBRL}
        />
        <InfoCard
          icon={<CreditCard className="size-4" />}
          label="Pagamento"
          value={plano.paymentMethod ?? "Asaas"}
          sub="renova automático"
        />
        <InfoCard
          icon={<Store className="size-4" />}
          label="Lojas"
          value={String(plano.activeUnits)}
          sub={plano.activeUnits === 1 ? "loja ativa" : "lojas ativas"}
        />
      </div>

      {/* Suporte */}
      <div className="rounded-xl border bg-card p-5">
        <p className="text-sm font-semibold">Dúvidas sobre seu plano?</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Fale com a gente pra verificar cobranças, notas ou qualquer detalhe do
          seu plano. Estamos aqui pra ajudar.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={WHATSAPP}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
          >
            <MessageCircle className="size-4" />
            WhatsApp
          </a>
          <a
            href={EMAIL}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Mail className="size-4" />
            suporte@deliveryos.food
          </a>
        </div>
      </div>

      {/* Histórico de pagamentos */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Histórico de pagamentos
        </h2>
        <div className="mt-2 overflow-hidden rounded-xl border bg-card">
          {plano.payments.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Ainda não há pagamentos registrados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Data</th>
                    <th className="px-4 py-2.5 font-semibold">Método</th>
                    <th className="px-4 py-2.5 text-right font-semibold">
                      Valor
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {plano.payments.map((p, i) => (
                    <tr
                      key={`${p.paidOn}-${i}`}
                      className="border-b last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-2.5 tabular-nums">
                        {fmtDataBR(p.paidOn)}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {p.method ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                        {fmtBRL(p.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Notas fiscais (emitidas pelo Asaas) */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Notas fiscais
        </h2>
        <div className="mt-2 overflow-hidden rounded-xl border bg-card">
          {notas.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhuma nota fiscal por aqui ainda. Elas aparecem sozinhas assim
              que forem emitidas, logo após a confirmação do pagamento.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Data</th>
                    <th className="px-4 py-2.5 font-semibold">Número</th>
                    <th className="px-4 py-2.5 text-right font-semibold">
                      Valor
                    </th>
                    <th className="px-4 py-2.5 text-right font-semibold">
                      Baixar
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {notas.map((n) => (
                    <tr
                      key={n.id}
                      className="border-b last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-2.5 tabular-nums">
                        {fmtDataBR(n.effectiveDate ?? null)}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {n.number ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                        {n.value != null ? fmtBRL(n.value) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {n.pdfUrl ? (
                          <span className="flex items-center justify-end gap-2">
                            <a
                              href={n.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted"
                            >
                              <Download className="size-3" />
                              PDF
                            </a>
                            {n.xmlUrl && (
                              <a
                                href={n.xmlUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                              >
                                XML
                              </a>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {NF_STATUS[n.status ?? ""] ?? "processando"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Cancelar */}
      {plano.subscriptionId && (
        <div className="flex justify-start">
          <CancelButton fimPeriodo={plano.dueDate} />
        </div>
      )}
    </div>
  )
}

function InfoCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1.5 text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}
