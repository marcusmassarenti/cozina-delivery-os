"use server"

import { revalidatePath } from "next/cache"

import { requireAuth } from "@/lib/auth/guards"
import { getAccessibleUnitIds, getCurrentHoldingId } from "@/lib/auth/roles"
import { isProPlan } from "@/lib/data/billing"
import { createAdminClient } from "@/lib/supabase/admin"
import { validateImageUpload } from "@/lib/upload/image"

export type ActionState = { ok: boolean; message?: string; id?: string }

async function ctx(): Promise<{
  holdingId: string
  admin: ReturnType<typeof createAdminClient>
}> {
  await requireAuth()
  // Fluxo de Caixa é do plano Pro. O gate estava só na UI (escondia o menu);
  // sem isto, um cliente Essencial chamava a server action direto e usava o
  // módulo sem pagar. isProPlan() libera superadmin e teste grátis.
  if (!(await isProPlan())) {
    throw new Error("O Fluxo de Caixa faz parte do plano Pro. Faça upgrade para usar.")
  }
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) throw new Error("Sem cliente (holding) associado ao usuário.")
  return { holdingId, admin: createAdminClient() }
}

/** Franqueado só grava na(s) loja(s) dele. Admin/franqueador (null) grava em qualquer. */
async function assertUnitAllowed(unitId: string | null): Promise<void> {
  const allowed = await getAccessibleUnitIds()
  if (allowed === null) return // admin / franqueador → sem restrição
  if (!unitId || !allowed.includes(unitId)) {
    throw new Error("Sem permissão para lançar nesta loja.")
  }
}

const num = (v: FormDataEntryValue | null): number => {
  if (v == null) return 0
  const n = parseFloat(String(v).replace(/\./g, "").replace(",", "."))
  return Number.isNaN(n) ? parseFloat(String(v)) || 0 : n
}
const txt = (v: FormDataEntryValue | null): string | null => {
  const s = String(v ?? "").trim()
  return s === "" ? null : s
}
const dateOr = (v: FormDataEntryValue | null): string | null => {
  const s = String(v ?? "").trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

// ───────────────────────────── Contas ───────────────────────────────────────
export async function saveAccount(formData: FormData): Promise<ActionState> {
  try {
    const { holdingId, admin } = await ctx()
    const id = txt(formData.get("id"))
    const intOr = (v: FormDataEntryValue | null): number | null => {
      const n = parseInt(String(v ?? ""), 10)
      return Number.isNaN(n) ? null : n
    }
    const row = {
      holding_id: holdingId,
      name: txt(formData.get("name")) ?? "",
      kind: String(formData.get("kind") ?? "conta_corrente"),
      bank: txt(formData.get("bank")),
      initial_balance: num(formData.get("initial_balance")),
      card_limit: formData.get("card_limit") ? num(formData.get("card_limit")) : null,
      closing_day: intOr(formData.get("closing_day")),
      due_day: intOr(formData.get("due_day")),
      color: txt(formData.get("color")),
      exclude_from_total: String(formData.get("exclude_from_total")) === "true",
      logo_url: txt(formData.get("logo_url")),
      unit_id: txt(formData.get("unit_id")),
    }
    if (!row.name) return { ok: false, message: "Dê um nome à conta." }
    await assertUnitAllowed(row.unit_id)
    if (id) {
      const { error } = await admin.from("fin_accounts").update(row).eq("id", id).eq("holding_id", holdingId)
      if (error) return { ok: false, message: error.message }
    } else {
      const { error } = await admin.from("fin_accounts").insert(row)
      if (error) return { ok: false, message: error.message }
    }
    revalidatePath("/caixa", "layout")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}

export async function deleteAccount(id: string): Promise<ActionState> {
  try {
    const { holdingId, admin } = await ctx()
    // Apaga os lançamentos ligados à conta ANTES de excluí-la. Sem isso, o
    // ON DELETE SET NULL deixava os lançamentos órfãos (account_id null): uma
    // compra de cartão órfã deixava de ser "cartão" e vazava pro fluxo de caixa
    // como despesa a pagar — o oposto do que a tela promete.
    const { error: delEntries } = await admin
      .from("fin_entries")
      .delete()
      .eq("holding_id", holdingId)
      .or(`account_id.eq.${id},to_account_id.eq.${id}`)
    if (delEntries) return { ok: false, message: delEntries.message }
    const { error } = await admin.from("fin_accounts").delete().eq("id", id).eq("holding_id", holdingId)
    if (error) return { ok: false, message: error.message }
    revalidatePath("/caixa", "layout")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}

// ─────────────────────────── Categorias ─────────────────────────────────────
export async function saveCategory(formData: FormData): Promise<ActionState> {
  try {
    const { holdingId, admin } = await ctx()
    const id = txt(formData.get("id"))
    const row = {
      holding_id: holdingId,
      name: txt(formData.get("name")) ?? "",
      parent_id: txt(formData.get("parent_id")),
      kind: String(formData.get("kind") ?? "despesa"),
      icon: txt(formData.get("icon")),
      color: txt(formData.get("color")),
      dre_group: txt(formData.get("dre_group")),
      natureza: txt(formData.get("natureza")),
    }
    if (!row.name) return { ok: false, message: "Dê um nome à categoria." }
    if (id) {
      const { error } = await admin.from("fin_categories").update(row).eq("id", id).eq("holding_id", holdingId)
      if (error) return { ok: false, message: error.message }
    } else {
      const { error } = await admin.from("fin_categories").insert(row)
      if (error) return { ok: false, message: error.message }
    }
    revalidatePath("/caixa", "layout")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}

/** Cria uma categoria rápido (inline no lançamento) e devolve o id. */
export async function createCategoryQuick(
  name: string,
  kind: string,
): Promise<{ ok: boolean; id?: string; message?: string }> {
  try {
    const { holdingId, admin } = await ctx()
    if (!name.trim()) return { ok: false, message: "Informe o nome." }
    const { data, error } = await admin
      .from("fin_categories")
      .insert({ holding_id: holdingId, name: name.trim(), kind, icon: "Tag" })
      .select("id")
      .single()
    if (error) return { ok: false, message: error.message }
    revalidatePath("/caixa", "layout")
    return { ok: true, id: data.id as string }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}

export async function deleteCategory(id: string): Promise<ActionState> {
  try {
    const { holdingId, admin } = await ctx()
    const { error } = await admin.from("fin_categories").delete().eq("id", id).eq("holding_id", holdingId)
    if (error) return { ok: false, message: error.message }
    revalidatePath("/caixa", "layout")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}

// ─────────────────────────── Lançamentos ────────────────────────────────────
function addMonthsISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + n, d))
  return dt.toISOString().slice(0, 10)
}
function addMonthsYM(year: number, month: number, n: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + n
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}
const pad2 = (n: number) => String(n).padStart(2, "0")
const round2 = (n: number) => Math.round(n * 100) / 100
/** Competência da fatura: compra após o fechamento entra na fatura do próximo mês. */
function cardCompetence(purchaseISO: string, closingDay: number): { year: number; month: number } {
  const [y, m, d] = purchaseISO.split("-").map(Number)
  return d > closingDay ? addMonthsYM(y, m, 1) : { year: y, month: m }
}

export async function saveEntry(formData: FormData): Promise<ActionState> {
  try {
    const { holdingId, admin } = await ctx()
    const id = txt(formData.get("id"))
    const kind = String(formData.get("kind") ?? "despesa")
    const isTransfer = kind === "transferencia"
    const due = dateOr(formData.get("due_date"))
    const paid = dateOr(formData.get("paid_date"))
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
    const value = num(formData.get("value"))
    if (!value) return { ok: false, message: "Informe o valor." }
    const accountId = txt(formData.get("account_id"))
    if (isTransfer) {
      const to = txt(formData.get("to_account_id"))
      if (!accountId || !to) return { ok: false, message: "Escolha as contas de origem e destino." }
      if (accountId === to) return { ok: false, message: "Origem e destino não podem ser iguais." }
    }
    const tagsRaw = txt(formData.get("tags"))
    const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : null
    const clamp = (k: string) =>
      Math.max(1, Math.min(60, parseInt(String(formData.get(k) ?? "1"), 10) || 1))

    const base = {
      holding_id: holdingId,
      kind,
      value,
      account_id: accountId,
      to_account_id: isTransfer ? txt(formData.get("to_account_id")) : null,
      category_id: isTransfer ? null : txt(formData.get("category_id")),
      titular: txt(formData.get("titular"))?.replace(/\s+/g, " ") ?? null,
      description: txt(formData.get("description")),
      tags,
      unit_id: txt(formData.get("unit_id")), // loja (puxada da conta no modal)
    }
    await assertUnitAllowed(base.unit_id)
    const makeRow = (dueDate: string | null, paidDate: string | null, group: string | null) => {
      const refBase = dueDate ?? paidDate ?? today
      return {
        ...base,
        due_date: dueDate,
        paid_date: paidDate,
        recurrence_group: group,
        ref_year: Number(refBase.slice(0, 4)),
        ref_month: Number(refBase.slice(5, 7)),
        updated_at: new Date().toISOString(),
      }
    }

    // EDIÇÃO (não recria séries; edita só o lançamento)
    if (id) {
      const { error } = await admin
        .from("fin_entries")
        .update(makeRow(due, paid, null))
        .eq("id", id)
        .eq("holding_id", holdingId)
      if (error) return { ok: false, message: error.message }
      revalidatePath("/caixa", "layout")
      return { ok: true }
    }

    // É compra no CARTÃO? (despesa com conta do tipo cartão) → vai pra fatura, parcelável.
    let card: { closing_day: number | null; due_day: number | null } | null = null
    if (accountId && kind === "despesa") {
      const { data } = await admin
        .from("fin_accounts")
        .select("kind, closing_day, due_day")
        .eq("id", accountId)
        .eq("holding_id", holdingId)
        .single()
      if (data?.kind === "cartao") card = data
    }

    if (card) {
      const parcelas = clamp("parcelas")
      const purchase = due ?? paid ?? today
      const closing = card.closing_day ?? 1
      const dueDay = Math.min(card.due_day ?? 10, 28)
      const group = parcelas > 1 ? crypto.randomUUID() : null
      const parte = round2(value / parcelas)
      const cBase = cardCompetence(purchase, closing)
      const rows = Array.from({ length: parcelas }, (_, i) => {
        const comp = addMonthsYM(cBase.year, cBase.month, i)
        const v = i === parcelas - 1 ? round2(value - parte * (parcelas - 1)) : parte
        const invoiceDue = `${comp.year}-${pad2(comp.month)}-${pad2(dueDay)}`
        return {
          ...base,
          value: v,
          due_date: invoiceDue,
          paid_date: null,
          invoice_year: comp.year,
          invoice_month: comp.month,
          installment_no: i + 1,
          installment_total: parcelas,
          recurrence_group: group,
          ref_year: comp.year,
          ref_month: comp.month,
          updated_at: new Date().toISOString(),
        }
      })
      const { error } = await admin.from("fin_entries").insert(rows)
      if (error) return { ok: false, message: error.message }
      revalidatePath("/caixa", "layout")
      return { ok: true }
    }

    // Conta normal: recorrência mensal opcional.
    const repeat = clamp("recorrencia")
    if (repeat > 1) {
      const group = crypto.randomUUID()
      const anchor = due ?? paid ?? today
      const rows = Array.from({ length: repeat }, (_, i) =>
        makeRow(addMonthsISO(anchor, i), i === 0 ? paid : null, group),
      )
      const { error } = await admin.from("fin_entries").insert(rows)
      if (error) return { ok: false, message: error.message }
    } else {
      const { error } = await admin.from("fin_entries").insert(makeRow(due, paid, null))
      if (error) return { ok: false, message: error.message }
    }
    revalidatePath("/caixa", "layout")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}

/** Paga a fatura de um cartão (competência): marca lançamentos como efetivados +
 * cria 1 despesa no caixa (na conta escolhida) = "pagamento de fatura". */
export async function payCardInvoice(
  cardId: string,
  year: number,
  month: number,
  fromAccountId: string,
): Promise<ActionState> {
  try {
    const { holdingId, admin } = await ctx()
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
    const { data: rows } = await admin
      .from("fin_entries")
      .select("id, value")
      .eq("holding_id", holdingId)
      .eq("account_id", cardId)
      .eq("invoice_year", year)
      .eq("invoice_month", month)
      .is("paid_date", null)
    const total = (rows ?? []).reduce((s, r) => s + Number(r.value ?? 0), 0)
    if (total <= 0) return { ok: false, message: "Fatura sem valor em aberto." }
    // A despesa de pagamento herda a loja da conta pagadora — senão o
    // pagamento cai na "Rede" e o saldo por loja fica errado.
    const { data: payAcc } = await admin
      .from("fin_accounts")
      .select("unit_id")
      .eq("id", fromAccountId)
      .eq("holding_id", holdingId)
      .maybeSingle()
    // marca as compras como pagas (a fatura foi quitada)
    await admin
      .from("fin_entries")
      .update({ paid_date: today, updated_at: new Date().toISOString() })
      .eq("holding_id", holdingId)
      .eq("account_id", cardId)
      .eq("invoice_year", year)
      .eq("invoice_month", month)
      .is("paid_date", null)
    // cria a despesa de pagamento no caixa
    const { error } = await admin.from("fin_entries").insert({
      holding_id: holdingId,
      kind: "despesa",
      value: total,
      account_id: fromAccountId,
      unit_id: (payAcc?.unit_id as string | null) ?? null,
      due_date: today,
      paid_date: today,
      is_card_payment: true,
      description: `Pagamento fatura ${pad2(month)}/${year}`,
      ref_year: year,
      ref_month: month,
    })
    if (error) return { ok: false, message: error.message }
    revalidatePath("/caixa", "layout")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}

/** Marca como efetivado (pago/recebido) hoje, ou desmarca. */
export async function toggleEntryPaid(id: string, paid: boolean): Promise<ActionState> {
  try {
    const { holdingId, admin } = await ctx()
    const paidDate = paid
      ? new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
      : null
    const { error } = await admin
      .from("fin_entries")
      .update({ paid_date: paidDate, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("holding_id", holdingId)
    if (error) return { ok: false, message: error.message }
    revalidatePath("/caixa", "layout")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}

export async function deleteEntry(id: string): Promise<ActionState> {
  try {
    const { holdingId, admin } = await ctx()
    const { error } = await admin.from("fin_entries").delete().eq("id", id).eq("holding_id", holdingId)
    if (error) return { ok: false, message: error.message }
    revalidatePath("/caixa", "layout")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}

// ─────────────────────────── Ações em lote ──────────────────────────────────
export async function bulkMarkPaid(ids: string[], paid: boolean): Promise<ActionState> {
  try {
    const { holdingId, admin } = await ctx()
    if (!ids.length) return { ok: true }
    const paidDate = paid
      ? new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
      : null
    const { error } = await admin
      .from("fin_entries")
      .update({ paid_date: paidDate, updated_at: new Date().toISOString() })
      .in("id", ids)
      .eq("holding_id", holdingId)
    if (error) return { ok: false, message: error.message }
    revalidatePath("/caixa", "layout")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}

export async function bulkDelete(ids: string[]): Promise<ActionState> {
  try {
    const { holdingId, admin } = await ctx()
    if (!ids.length) return { ok: true }
    const { error } = await admin.from("fin_entries").delete().in("id", ids).eq("holding_id", holdingId)
    if (error) return { ok: false, message: error.message }
    revalidatePath("/caixa", "layout")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}

export async function bulkCategorize(ids: string[], categoryId: string): Promise<ActionState> {
  try {
    const { holdingId, admin } = await ctx()
    if (!ids.length) return { ok: true }
    const { error } = await admin
      .from("fin_entries")
      .update({ category_id: categoryId || null, updated_at: new Date().toISOString() })
      .in("id", ids)
      .eq("holding_id", holdingId)
    if (error) return { ok: false, message: error.message }
    revalidatePath("/caixa", "layout")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}

// ─────────────────────────── Contatos (Cadastros) ──────────────────────────
const digits = (v: FormDataEntryValue | null) => String(v ?? "").replace(/\D/g, "") || null

export async function saveContact(formData: FormData): Promise<ActionState> {
  try {
    const { holdingId, admin } = await ctx()
    const id = txt(formData.get("id"))
    const row = {
      holding_id: holdingId,
      person_type: String(formData.get("person_type") ?? "pj"),
      name: txt(formData.get("name")) ?? "",
      legal_name: txt(formData.get("legal_name")),
      doc: digits(formData.get("doc")),
      contact_type: String(formData.get("contact_type") ?? "cliente"),
      payment_term: txt(formData.get("payment_term")),
      state_registration: txt(formData.get("state_registration")),
      phone: txt(formData.get("phone")),
      email: txt(formData.get("email")),
      cep: digits(formData.get("cep")),
      logradouro: txt(formData.get("logradouro")),
      numero: txt(formData.get("numero")),
      bairro: txt(formData.get("bairro")),
      cidade: txt(formData.get("cidade")),
      uf: txt(formData.get("uf")),
      complemento: txt(formData.get("complemento")),
      updated_at: new Date().toISOString(),
    }
    if (!row.name) return { ok: false, message: "Informe o nome." }
    if (id) {
      const { error } = await admin.from("fin_contacts").update(row).eq("id", id).eq("holding_id", holdingId)
      if (error) return { ok: false, message: error.message }
    } else {
      const { error } = await admin.from("fin_contacts").insert(row)
      if (error) return { ok: false, message: error.message }
    }
    revalidatePath("/caixa", "layout")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}

export async function deleteContact(id: string): Promise<ActionState> {
  try {
    const { holdingId, admin } = await ctx()
    const { error } = await admin.from("fin_contacts").delete().eq("id", id).eq("holding_id", holdingId)
    if (error) return { ok: false, message: error.message }
    revalidatePath("/caixa", "layout")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}

export type CepData = { logradouro: string; bairro: string; cidade: string; uf: string }
export async function lookupCEP(cep: string): Promise<{ ok: boolean; message?: string; data?: CepData }> {
  try {
    const c = cep.replace(/\D/g, "")
    if (c.length !== 8) return { ok: false, message: "CEP inválido." }
    const res = await fetch(`https://viacep.com.br/ws/${c}/json/`, { cache: "no-store" })
    if (!res.ok) return { ok: false, message: "Falha ao consultar CEP." }
    const j = await res.json()
    if (j.erro) return { ok: false, message: "CEP não encontrado." }
    return {
      ok: true,
      data: {
        logradouro: j.logradouro ?? "",
        bairro: j.bairro ?? "",
        cidade: j.localidade ?? "",
        uf: j.uf ?? "",
      },
    }
  } catch {
    return { ok: false, message: "Erro ao consultar CEP." }
  }
}

export type CnpjData = {
  name: string
  legalName: string
  phone: string
  email: string
  cep: string
  logradouro: string
  numero: string
  bairro: string
  cidade: string
  uf: string
}
function mapBrasilAPI(j: Record<string, unknown>): CnpjData {
  return {
    name: (j.nome_fantasia as string) || (j.razao_social as string) || "",
    legalName: (j.razao_social as string) ?? "",
    phone: (j.ddd_telefone_1 as string) ?? "",
    email: (j.email as string) ?? "",
    cep: String(j.cep ?? "").replace(/\D/g, ""),
    logradouro: [j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(" ").trim(),
    numero: (j.numero as string) ?? "",
    bairro: (j.bairro as string) ?? "",
    cidade: (j.municipio as string) ?? "",
    uf: (j.uf as string) ?? "",
  }
}
function mapCnpjWs(j: Record<string, unknown>): CnpjData {
  const e = (j.estabelecimento as Record<string, unknown>) ?? {}
  const cidade = (e.cidade as Record<string, unknown>) ?? {}
  const estado = (e.estado as Record<string, unknown>) ?? {}
  const ddd = e.ddd1 as string
  const tel = e.telefone1 as string
  return {
    name: (e.nome_fantasia as string) || (j.razao_social as string) || "",
    legalName: (j.razao_social as string) ?? "",
    phone: ddd && tel ? `${ddd}${tel}` : (tel ?? ""),
    email: (e.email as string) ?? "",
    cep: String(e.cep ?? "").replace(/\D/g, ""),
    logradouro: [e.tipo_logradouro, e.logradouro].filter(Boolean).join(" ").trim(),
    numero: (e.numero as string) ?? "",
    bairro: (e.bairro as string) ?? "",
    cidade: (cidade.nome as string) ?? "",
    uf: (estado.sigla as string) ?? "",
  }
}

export async function lookupCNPJ(cnpj: string): Promise<{ ok: boolean; message?: string; data?: CnpjData }> {
  const c = cnpj.replace(/\D/g, "")
  if (c.length !== 14) return { ok: false, message: "CNPJ inválido (precisa de 14 dígitos)." }
  let rateLimited = false
  // 1) BrasilAPI
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${c}`, { cache: "no-store" })
    if (res.ok) return { ok: true, data: mapBrasilAPI(await res.json()) }
    if (res.status === 429) rateLimited = true
  } catch {
    /* tenta o fallback */
  }
  // 2) CNPJ.ws (pública) — fallback
  try {
    const res = await fetch(`https://publica.cnpj.ws/cnpj/${c}`, { cache: "no-store" })
    if (res.ok) return { ok: true, data: mapCnpjWs(await res.json()) }
    if (res.status === 429) rateLimited = true
    if (res.status === 404) return { ok: false, message: "CNPJ não encontrado na Receita." }
  } catch {
    /* cai pra mensagem final */
  }
  return {
    ok: false,
    message: rateLimited
      ? "Muitas consultas em pouco tempo — espere alguns segundos e tente de novo."
      : "Não consegui consultar agora. Tente novamente em instantes.",
  }
}

// ─────────────────────────── Upload de logo ────────────────────────────────
export async function uploadLogo(
  formData: FormData,
): Promise<{ ok: boolean; url?: string; message?: string }> {
  try {
    const { holdingId, admin } = await ctx()
    const img = await validateImageUpload(formData.get("file"))
    if (!img.ok) return { ok: false, message: img.message }
    const path = `${holdingId}/${crypto.randomUUID()}.${img.ext}`
    const { error } = await admin.storage
      .from("fin-logos")
      .upload(path, img.bytes, { contentType: img.contentType, upsert: false })
    if (error) return { ok: false, message: error.message }
    const { data } = admin.storage.from("fin-logos").getPublicUrl(path)
    return { ok: true, url: data.publicUrl }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro no upload." }
  }
}

// ──────────────────── Seed de categorias padrão (restaurante) ────────────────
// Já classificadas por grupo de DRE (dre) e natureza (nat: fixo/variável) — é o
// que destrava DRE gerencial, margem de contribuição e ponto de equilíbrio.
const DEFAULTS: {
  name: string
  kind: "despesa" | "receita"
  icon: string
  dre: "receita" | "deducao" | "cmv" | "cmo" | "fixa" | "variavel" | "investimento"
  nat: "fixo" | "variavel"
  subs?: string[]
}[] = [
  // Receita
  { name: "Delivery", kind: "receita", icon: "Bike", dre: "receita", nat: "variavel", subs: ["iFood", "99 Food", "Keeta"] },
  { name: "Salão / Balcão", kind: "receita", icon: "Store", dre: "receita", nat: "variavel" },
  { name: "Outras Receitas", kind: "receita", icon: "Plus", dre: "receita", nat: "variavel" },
  // Deduções da receita (variáveis)
  { name: "Taxas de Delivery", kind: "despesa", icon: "Bike", dre: "deducao", nat: "variavel", subs: ["Comissão marketplace", "Taxa de entrega", "Antecipação de recebíveis"] },
  { name: "Taxas de Cartão / Maquininha", kind: "despesa", icon: "CreditCard", dre: "deducao", nat: "variavel" },
  { name: "Impostos sobre Venda (Simples / DAS)", kind: "despesa", icon: "Landmark", dre: "deducao", nat: "variavel" },
  // CMV — custo de mercadoria (variável)
  { name: "Insumos / CMV", kind: "despesa", icon: "Truck", dre: "cmv", nat: "variavel", subs: ["Carnes", "Bebidas", "Hortifruti", "Mercearia", "Embalagens / Descartáveis", "Gás (GLP)"] },
  // CMO — mão de obra
  { name: "Folha de Pagamento", kind: "despesa", icon: "Users", dre: "cmo", nat: "fixo", subs: ["Salários", "Encargos (INSS/FGTS)", "VT / VR", "Freelas / Extras"] },
  { name: "Pró-labore / Retirada", kind: "despesa", icon: "UserCog", dre: "cmo", nat: "fixo" },
  // Despesas fixas / ocupação
  { name: "Aluguel", kind: "despesa", icon: "Home", dre: "fixa", nat: "fixo", subs: ["Condomínio", "IPTU", "Seguro"] },
  { name: "Energia", kind: "despesa", icon: "Zap", dre: "fixa", nat: "fixo" },
  { name: "Água", kind: "despesa", icon: "Droplet", dre: "fixa", nat: "fixo" },
  { name: "Internet / Telefone", kind: "despesa", icon: "Wifi", dre: "fixa", nat: "fixo" },
  { name: "Software / Sistemas (PDV)", kind: "despesa", icon: "MonitorSmartphone", dre: "fixa", nat: "fixo" },
  { name: "Contador", kind: "despesa", icon: "Calculator", dre: "fixa", nat: "fixo" },
  { name: "Taxas Bancárias", kind: "despesa", icon: "Landmark", dre: "fixa", nat: "fixo" },
  { name: "Marketing", kind: "despesa", icon: "Megaphone", dre: "fixa", nat: "fixo" },
  { name: "Manutenção", kind: "despesa", icon: "Wrench", dre: "fixa", nat: "fixo" },
  { name: "Outras Despesas", kind: "despesa", icon: "MoreHorizontal", dre: "variavel", nat: "variavel" },
  // Investimentos (não-operacional)
  { name: "Investimentos / Equipamentos", kind: "despesa", icon: "Hammer", dre: "investimento", nat: "fixo" },
]

export async function seedDefaultCategories(): Promise<ActionState> {
  try {
    const { holdingId, admin } = await ctx()
    const { count } = await admin
      .from("fin_categories")
      .select("*", { count: "exact", head: true })
      .eq("holding_id", holdingId)
    if ((count ?? 0) > 0) return { ok: true, message: "Já existem categorias." }

    let order = 0
    for (const c of DEFAULTS) {
      const { data: parent, error } = await admin
        .from("fin_categories")
        .insert({
          holding_id: holdingId,
          name: c.name,
          kind: c.kind,
          icon: c.icon,
          dre_group: c.dre,
          natureza: c.nat,
          sort_order: order++,
        })
        .select("id")
        .single()
      if (error) return { ok: false, message: error.message }
      if (c.subs && parent) {
        let so = 0
        await admin.from("fin_categories").insert(
          c.subs.map((s) => ({
            holding_id: holdingId,
            name: s,
            kind: c.kind,
            parent_id: parent.id,
            icon: c.icon,
            dre_group: c.dre,
            natureza: c.nat,
            sort_order: so++,
          })),
        )
      }
    }
    revalidatePath("/caixa", "layout")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}
