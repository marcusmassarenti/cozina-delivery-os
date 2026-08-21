"use client"

import {
  Building2,
  CreditCard,
  FileText,
  MapPin,
  Phone,
  ReceiptText,
  Sparkles,
  Store,
  User,
  Users,
} from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import type { ClientDetail } from "@/lib/data/plataforma"
import type { BillingStatus } from "@/lib/data/billing"
import { fmtBRL } from "@/lib/format"

import { ACAO_LABEL } from "@/lib/auditoria-labels"

import { ConviteAsaasButton } from "./convite-asaas-button"
import { AvisoPushDialog } from "./aviso-push-dialog"
import { VerComoBotao } from "./ver-como-botao"
import { EditBillingDialog } from "./edit-billing-dialog"
import { PlanControls } from "./plan-controls"
import { DescontoNegociado } from "./desconto-negociado"

/** Dias de hoje até uma data ISO (fuso SP). Inline pra não puxar server-only. */
function daysUntil(dateISO: string): number {
  const now = new Date()
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
  const a = new Date(`${today}T00:00:00-03:00`).getTime()
  const b = new Date(`${dateISO}T00:00:00-03:00`).getTime()
  return Math.round((b - a) / 86_400_000)
}

const STATUS: Record<BillingStatus, { label: string; cls: string }> = {
  trial: {
    label: "Teste grátis",
    cls: "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-400",
  },
  paid: {
    label: "Pago",
    cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
  },
  pending: {
    label: "Pendente",
    cls: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-400",
  },
  overdue: {
    label: "Em atraso",
    cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
  },
  suspended: {
    label: "Suspenso",
    cls: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400",
  },
  none: { label: "Sem cobrança", cls: "bg-muted text-muted-foreground" },
}

function fmtDateISO(d: string | null): string {
  if (!d) return "—"
  const [y, m, day] = d.split("-")
  return `${day}/${m}/${y}`
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return "nunca"
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}
function trialLabel(iso: string | null): string {
  if (!iso) return ""
  const d = daysUntil(iso)
  if (d < 0) return "venceu"
  if (d === 0) return "vence hoje"
  return `vence em ${d} dia${d === 1 ? "" : "s"}`
}
function fmtDoc(doc: string): string {
  const s = (doc ?? "").replace(/\D/g, "")
  if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
  if (s.length === 14)
    return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
  return doc || "—"
}
function onlyDigits(s: string | null): string {
  return (s ?? "").replace(/\D/g, "")
}
const PLAN_LABEL: Record<string, string> = {
  essencial: "Essencial",
  pro: "Pro",
  ai: "AI",
}
const NF_STATUS: Record<string, { label: string; cls: string }> = {
  AUTHORIZED: { label: "Emitida", cls: "text-emerald-600 dark:text-emerald-400" },
  SYNCHRONIZED: { label: "Sincronizada", cls: "text-sky-600 dark:text-sky-400" },
  SCHEDULED: { label: "Agendada", cls: "text-muted-foreground" },
  PROCESSING_CANCELLATION: { label: "Cancelando", cls: "text-amber-600" },
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // min-w-0 + break-words: item de grid tem largura mínima igual ao conteúdo,
    // então um e-mail longo empurrava a coluna e ia parar por cima do campo
    // vizinho (o WhatsApp). Vale pra qualquer valor comprido, não só e-mail.
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="break-words text-sm">{children || "—"}</span>
    </div>
  )
}
function Card({
  title,
  icon: Icon,
  count,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  count?: number
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b px-5 py-3">
        <Icon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{title}</h2>
        {count != null && (
          <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

/**
 * Corpo do detalhe do cliente. Usado tanto na página /plataforma/[id] quanto
 * no drawer lateral da lista (mesma tela). `embedded` tira o header próprio
 * (o drawer já tem título) e o padding externo.
 */
export function ClientDetailView({
  detail: c,
  embedded = false,
  onChanged,
}: {
  detail: ClientDetail
  embedded?: boolean
  /** Chamado após uma mudança (plano/cortesia) — no drawer, re-busca o
   *  detalhe (o router.refresh não atualiza o conteúdo do drawer). */
  onChanged?: () => void
}) {
  const st = STATUS[c.billingStatus]
  const waLink = (n: string | null) => {
    const d = onlyDigits(n)
    if (!d) return null
    return `https://wa.me/${d.length <= 11 ? `55${d}` : d}`
  }
  const contactWa = waLink(c.contactWhatsapp)
  const f = c.fiscal
  const endereco = c.enderecoFmt

  return (
    <div className={embedded ? "flex flex-col gap-5" : "flex flex-1 flex-col gap-5 bg-muted/30 p-6"}>
      {/* Ações SOBRE o cliente ficam no topo, não dentro de um card de assunto.
          O "Enviar aviso" nasceu colado no Editar da mensalidade e ninguém
          acharia: push não tem nada a ver com cobrança. No drawer o cabeçalho é
          do Sheet, então a barra aparece aqui em cima do conteúdo — a página
          cheia tem as mesmas ações dentro do próprio cabeçalho, mais abaixo. */}
      {embedded && (
        <div className="flex flex-wrap items-center gap-2 border-b pb-3">
          <AvisoPushDialog holdingId={c.id} holdingName={c.name} />
          <VerComoBotao holdingId={c.id} holdingName={c.name} />
        </div>
      )}
      {!embedded && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Building2 className="size-6 text-muted-foreground" />
            <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${st.cls}`}
            >
              {st.label}
            </span>
            {c.planTier && (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                {PLAN_LABEL[c.planTier] ?? c.planTier}
              </span>
            )}
            {c.asaasActive && (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                Asaas ✓
              </span>
            )}
            <span className="ml-auto">
              <AvisoPushDialog holdingId={c.id} holdingName={c.name} />
              <VerComoBotao holdingId={c.id} holdingName={c.name} />
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {c.establishmentType ?? "Tipo não definido"} · {c.activeUnits} loja
            {c.activeUnits !== 1 ? "s" : ""} ativa{c.activeUnits !== 1 ? "s" : ""}
            {c.units !== c.activeUnits ? ` de ${c.units}` : ""} · {c.users} usuário
            {c.users !== 1 ? "s" : ""}
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Dados básicos & contato" icon={User}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Empresa">{c.name}</Field>
            <Field label="Titular">{c.contactName}</Field>
            <Field label="E-mail de login">
              {c.loginEmail ? (
                <a href={`mailto:${c.loginEmail}`} className="text-primary hover:underline">
                  {c.loginEmail}
                </a>
              ) : null}
            </Field>
            <Field label="WhatsApp">
              {contactWa ? (
                <a
                  href={contactWa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <Phone className="size-3.5" />
                  {c.contactWhatsapp}
                </a>
              ) : null}
            </Field>
            <Field label="Tipo de estabelecimento">{c.establishmentType}</Field>
            <Field label="Cadastrado em">{fmtDateTime(c.createdAt)}</Field>
            <Field label="Último acesso">{fmtDateTime(c.lastLogin)}</Field>
            {c.billingStatus === "trial" && c.trialEndsAt && (
              <Field label="Teste grátis">
                <span className="text-violet-700 dark:text-violet-400">
                  {fmtDateISO(c.trialEndsAt)} · {trialLabel(c.trialEndsAt)}
                </span>
              </Field>
            )}
          </div>
        </Card>

        <Card title="Cobrança & assinatura" icon={CreditCard}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Mensalidade">
              {c.computedMonthly > 0 ? `${fmtBRL(c.computedMonthly)}/mês` : "—"}
            </Field>
            {/* Antes havia dois campos pra mesma pergunta ("Forma de
                pagamento" e "Assinatura Asaas"), e eles podiam discordar. */}
            <Field label="Pagamento">
              {c.asaasActive
                ? "Assinatura no Asaas (recorrente)"
                : c.contaInterna
                  ? "—"
                  : "Fora do Asaas — cobrança manual"}
            </Field>
            <Field label="Plano">
              {c.planTier ? (PLAN_LABEL[c.planTier] ?? c.planTier) : "—"}
            </Field>
            <Field label="Vencimento">{fmtDateISO(c.dueDate)}</Field>
            <Field label="Lojas cobradas">
              {c.billableUnits}
              {c.includedUnits > 0 ? ` (${c.includedUnits} inclusa${c.includedUnits !== 1 ? "s" : ""})` : ""}
            </Field>
            <Field label="Cliente no Asaas">
              {c.asaasCustomerId ? "Cadastrado" : "Ainda não cadastrado"}
            </Field>
            {c.suspendOn && <Field label="Suspende em">{fmtDateISO(c.suspendOn)}</Field>}
          </div>

          {/* Memória de cálculo. Fatura que ninguém sabe explicar vira
              discussão com o cliente — aqui a conta fica à vista. */}
          <div className="mt-3 rounded-lg border border-dashed p-3 text-xs">
            {c.precoNegociado ? (
              <p className="text-amber-700 dark:text-amber-400">
                <b>Preço negociado</b> — este cliente está fora da tabela. O
                valor foi digitado à mão e não acompanha o plano.
              </p>
            ) : c.planTier && c.planoFirst != null && c.planoAdd != null ? (
              <p className="text-muted-foreground">
                <b>{PLAN_LABEL[c.planTier] ?? c.planTier}</b> ·{" "}
                {fmtBRL(c.planoFirst)} (1ª loja)
                {c.billableUnits > 1 ? (
                  <>
                    {" "}
                    + {c.billableUnits - 1} × {fmtBRL(c.planoAdd)}
                  </>
                ) : null}{" "}
                = <b className="text-foreground">{fmtBRL(c.computedMonthly)}/mês</b>
                <span className="ml-1 opacity-70">
                  · recalcula sozinho quando ele abre ou fecha loja
                </span>
              </p>
            ) : (
              <p className="text-amber-700 dark:text-amber-400">
                Sem plano definido — nada é cobrado. Escolha o plano abaixo.
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <EditBillingDialog client={c} />
              {/* O seletor de plano vivia num card lá embaixo ("Plano & Nino
                  AI"), enquanto o aviso "Escolha o plano abaixo" ficava aqui.
                  Quem lia o aviso não achava o controle. Agora estão juntos —
                  plano, preço e desconto respondem à mesma pergunta. */}
              <PlanControls
                holdingId={c.id}
                planTier={c.planTier}
                ninoTrialEndsAt={c.ninoTrialEndsAt}
                onChanged={onChanged}
                compacto
              />
            </div>

            <DescontoNegociado
              holdingId={c.id}
              tipo={c.descontoTipo}
              valor={c.descontoValor}
              ate={c.descontoAte}
              nota={c.descontoNota}
              mensalCheio={c.computedMonthly}
            />
            {!c.contaInterna && (
              <div className="mt-2 border-t pt-2">
                <ConviteAsaasButton
                  holdingId={c.id}
                  clienteNome={c.name}
                  convidadoEm={c.conviteAsaasEm}
                  jaTemAssinatura={c.asaasActive}
                  valorMensal={c.computedMonthly}
                  vencimento={c.dueDate}
                  billingType={c.billingType}
                />
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Histórico de faturas. É a metade que faltava: holding_payments só
          guardava o que ENTROU, então o que o cliente deixou de pagar não
          existia em lugar nenhum — e sem isso não há inadimplência nem
          histórico de atraso. */}
      <Card title="Faturas" icon={CreditCard}>
        {c.faturas.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma fatura emitida. Elas são geradas automaticamente todo mês
            para clientes com plano e fora do teste grátis.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Competência</th>
                  <th className="px-3 py-2 text-left font-medium">Vencimento</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                  <th className="px-3 py-2 text-left font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {c.faturas.map((f) => (
                  <tr key={f.id} className="border-t">
                    <td className="px-3 py-2 font-medium tabular-nums">
                      {f.competencia}
                      {f.lojasCobradas != null && (
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                          · {f.lojasCobradas} loja
                          {f.lojasCobradas !== 1 ? "s" : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {fmtDateISO(f.vencimento)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {fmtBRL(f.valor)}
                    </td>
                    <td className="px-3 py-2">
                      {f.status === "paga" ? (
                        <span className="text-emerald-700 dark:text-emerald-400">
                          paga {f.pagoEm ? `em ${fmtDateISO(f.pagoEm)}` : ""}
                        </span>
                      ) : f.status === "cancelada" ? (
                        <span className="text-muted-foreground">cancelada</span>
                      ) : f.vencida ? (
                        <span className="font-semibold text-rose-600 dark:text-rose-400">
                          em atraso
                        </span>
                      ) : (
                        <span className="text-muted-foreground">em aberto</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {c.auditoria.length > 0 && (
        <Card title="Histórico de mudanças" icon={CreditCard}>
          <ul className="space-y-1.5">
            {c.auditoria.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                <span className="tabular-nums text-muted-foreground">
                  {new Date(a.em).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="font-medium">
                  {ACAO_LABEL[a.acao] ?? a.acao}
                </span>
                <span className="text-muted-foreground">por {a.autor}</span>
                {a.detalhe && (
                  <span className="text-[11px] text-muted-foreground">
                    ·{" "}
                    {Object.entries(a.detalhe)
                      .filter(([, v]) => v !== null && v !== undefined)
                      .map(([k, v]) => `${k}: ${String(v)}`)
                      .join(" · ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Plano & Nino AI" icon={Sparkles}>
        <PlanControls
          holdingId={c.id}
          planTier={c.planTier}
          ninoTrialEndsAt={c.ninoTrialEndsAt}
          onChanged={onChanged}
        />
        {/* Consumo do Nino no mês — quanto ele usou e quanto custou de API. */}
        {(c.consumoIa.mensagens > 0 || c.consumoIa.custoUsd > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
            <span className="font-medium text-muted-foreground">
              Consumo do mês:
            </span>
            <span>
              <b className="tabular-nums">{c.consumoIa.mensagens}</b> mensagens
            </span>
            <span>
              custo de API{" "}
              <b className="tabular-nums">
                US$ {c.consumoIa.custoUsd.toFixed(2)}
              </b>
            </span>
            {c.consumoIa.respostasMedidas < c.consumoIa.mensagens && (
              <span className="text-[11px] text-muted-foreground">
                ({c.consumoIa.respostasMedidas} com custo medido — o registro
                começou em 23/07)
              </span>
            )}
          </div>
        )}
      </Card>

      <Card title="Dados fiscais & empresa (Nota Fiscal)" icon={ReceiptText}>
        {c.fiscalPreenchido ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {c.fiscalFromAsaas && (
              <div className="sm:col-span-2 lg:col-span-3 -mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="rounded-full bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                  via Asaas
                </span>
                Cliente ainda não preencheu no sistema — dados puxados do cadastro
                de cobrança.
              </div>
            )}
            <Field label="Tipo">
              {f.accountType === "PJ"
                ? "Pessoa Jurídica"
                : f.accountType === "PF"
                  ? "Pessoa Física"
                  : "—"}
            </Field>
            <Field label={f.accountType === "PJ" ? "CNPJ" : "CPF/CNPJ"}>
              {f.cpfCnpj ? fmtDoc(f.cpfCnpj) : null}
            </Field>
            <Field label="Razão social / nome">{f.razaoSocial}</Field>
            <Field label="Telefone">{f.telefone}</Field>
            <Field label="E-mail (NF)">{f.email}</Field>
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Endereço">
                <span className="inline-flex items-start gap-1.5">
                  {endereco && <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}
                  {endereco}
                </span>
              </Field>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            O cliente ainda não preencheu os dados fiscais em{" "}
            <span className="font-medium">Minha conta › Informações</span>.
          </p>
        )}
      </Card>

      <Card title="Lojas" icon={Store} count={c.unitsFull.length}>
        {c.unitsFull.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma loja cadastrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Loja</th>
                  <th className="py-2 pr-3 font-semibold">Código</th>
                  <th className="py-2 pr-3 font-semibold">CNPJ</th>
                  <th className="py-2 pr-3 font-semibold">Cidade</th>
                  <th className="py-2 pr-3 font-semibold">Plataformas</th>
                  <th className="py-2 pr-3 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {c.unitsFull.map((u) => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{u.name}</div>
                      {u.brandName && u.brandName !== u.name && (
                        <div className="text-[11px] text-muted-foreground">
                          {u.brandName}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                      {u.code ?? "—"}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                      {u.cnpj ? fmtDoc(u.cnpj) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {u.city ? `${u.city}${u.state ? `/${u.state}` : ""}` : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      {u.platforms.length ? (
                        <span className="inline-flex items-center gap-1">
                          {u.platforms.map((p) => (
                            <PlatformLogo key={p} platform={p} size="sm" />
                          ))}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {u.active ? (
                        <span className="text-emerald-600 dark:text-emerald-400">Ativa</span>
                      ) : (
                        <span className="text-muted-foreground">Inativa</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Usuários" icon={Users} count={c.usersList.length}>
        {c.usersList.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum usuário.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Nome</th>
                  <th className="py-2 pr-3 font-semibold">E-mail</th>
                  <th className="py-2 pr-3 font-semibold">WhatsApp</th>
                  <th className="py-2 pr-3 font-semibold">Perfil</th>
                  <th className="py-2 pr-3 font-semibold">Acesso</th>
                  <th className="py-2 pr-3 text-right font-semibold">Último acesso</th>
                </tr>
              </thead>
              <tbody>
                {c.usersList.map((u) => {
                  const wa = waLink(u.whatsapp)
                  return (
                    <tr key={u.userId} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">
                        {u.name ?? "—"}
                        {u.isAdmin && (
                          <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                            admin
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {u.email ? (
                          <a href={`mailto:${u.email}`} className="text-primary hover:underline">
                            {u.email}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {wa ? (
                          <a href={wa} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            {u.whatsapp}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 pr-3 capitalize text-muted-foreground">
                        {u.perfil ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {u.scope === "holding"
                          ? "Empresa toda"
                          : u.scope === "brand"
                            ? "Marca"
                            : "1 loja"}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                        {fmtDateTime(u.lastLogin)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Pagamentos recebidos" icon={CreditCard} count={c.payments.length}>
        {c.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum pagamento registrado ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Data</th>
                  <th className="py-2 pr-3 font-semibold">Ref.</th>
                  <th className="py-2 pr-3 font-semibold">Forma</th>
                  <th className="py-2 pr-3 font-semibold">Obs.</th>
                  <th className="py-2 pr-3 text-right font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody>
                {c.payments.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 tabular-nums">{fmtDateISO(p.paidOn)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{p.refMonth ?? "—"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{p.method ?? "—"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{p.note ?? "—"}</td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                      {fmtBRL(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Notas fiscais emitidas" icon={FileText} count={c.invoices.length}>
        {!c.asaasCustomerId ? (
          <p className="text-sm text-muted-foreground">
            Cliente sem cadastro no Asaas — nenhuma nota emitida pela plataforma.
          </p>
        ) : c.invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma nota fiscal emitida ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Número</th>
                  <th className="py-2 pr-3 font-semibold">Data</th>
                  <th className="py-2 pr-3 font-semibold">Serviço</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 pr-3 text-right font-semibold">Valor</th>
                  <th className="py-2 pr-3 text-right font-semibold">Arquivos</th>
                </tr>
              </thead>
              <tbody>
                {c.invoices.map((n) => {
                  const s = n.status ? NF_STATUS[n.status] : null
                  return (
                    <tr key={n.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 tabular-nums">{n.number ?? "—"}</td>
                      <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                        {fmtDateISO(n.effectiveDate)}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {n.serviceDescription ?? "—"}
                      </td>
                      <td className={`py-2 pr-3 ${s?.cls ?? "text-muted-foreground"}`}>
                        {s?.label ?? n.status ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                        {n.value != null ? fmtBRL(n.value) : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <span className="inline-flex items-center justify-end gap-2">
                          {n.pdfUrl && (
                            <a href={n.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                              PDF
                            </a>
                          )}
                          {n.xmlUrl && (
                            <a href={n.xmlUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:underline">
                              XML
                            </a>
                          )}
                          {!n.pdfUrl && !n.xmlUrl && "—"}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
