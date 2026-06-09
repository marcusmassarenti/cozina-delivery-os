"use server"

import { revalidatePath } from "next/cache"

import { requireAuth } from "@/lib/auth/guards"
import { getCurrentHoldingId } from "@/lib/auth/roles"
import { createAdminClient } from "@/lib/supabase/admin"

export type ActionState = { ok: boolean; message?: string; id?: string }

async function ctx(): Promise<{
  holdingId: string
  admin: ReturnType<typeof createAdminClient>
}> {
  await requireAuth()
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) throw new Error("Sem cliente (holding) associado ao usuário.")
  return { holdingId, admin: createAdminClient() }
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
    const row = {
      holding_id: holdingId,
      name: txt(formData.get("name")) ?? "",
      kind: String(formData.get("kind") ?? "conta_corrente"),
      bank: txt(formData.get("bank")),
      initial_balance: num(formData.get("initial_balance")),
    }
    if (!row.name) return { ok: false, message: "Dê um nome à conta." }
    if (id) {
      const { error } = await admin.from("fin_accounts").update(row).eq("id", id).eq("holding_id", holdingId)
      if (error) return { ok: false, message: error.message }
    } else {
      const { error } = await admin.from("fin_accounts").insert(row)
      if (error) return { ok: false, message: error.message }
    }
    revalidatePath("/caixa")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}

export async function deleteAccount(id: string): Promise<ActionState> {
  try {
    const { holdingId, admin } = await ctx()
    const { error } = await admin.from("fin_accounts").delete().eq("id", id).eq("holding_id", holdingId)
    if (error) return { ok: false, message: error.message }
    revalidatePath("/caixa")
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
    }
    if (!row.name) return { ok: false, message: "Dê um nome à categoria." }
    if (id) {
      const { error } = await admin.from("fin_categories").update(row).eq("id", id).eq("holding_id", holdingId)
      if (error) return { ok: false, message: error.message }
    } else {
      const { error } = await admin.from("fin_categories").insert(row)
      if (error) return { ok: false, message: error.message }
    }
    revalidatePath("/caixa")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}

export async function deleteCategory(id: string): Promise<ActionState> {
  try {
    const { holdingId, admin } = await ctx()
    const { error } = await admin.from("fin_categories").delete().eq("id", id).eq("holding_id", holdingId)
    if (error) return { ok: false, message: error.message }
    revalidatePath("/caixa")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}

// ─────────────────────────── Lançamentos ────────────────────────────────────
export async function saveEntry(formData: FormData): Promise<ActionState> {
  try {
    const { holdingId, admin } = await ctx()
    const id = txt(formData.get("id"))
    const due = dateOr(formData.get("due_date"))
    const paid = dateOr(formData.get("paid_date"))
    // Sem data → usa hoje como competência (senão o lançamento fica "sem período").
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Sao_Paulo",
    })
    const refBase = due ?? paid ?? today
    const tagsRaw = txt(formData.get("tags"))
    const row = {
      holding_id: holdingId,
      kind: String(formData.get("kind") ?? "despesa"),
      value: num(formData.get("value")),
      due_date: due,
      paid_date: paid,
      account_id: txt(formData.get("account_id")),
      category_id: txt(formData.get("category_id")),
      titular: txt(formData.get("titular")),
      description: txt(formData.get("description")),
      tags: tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : null,
      ref_year: refBase ? Number(refBase.slice(0, 4)) : null,
      ref_month: refBase ? Number(refBase.slice(5, 7)) : null,
      updated_at: new Date().toISOString(),
    }
    if (!row.value) return { ok: false, message: "Informe o valor." }
    if (id) {
      const { error } = await admin.from("fin_entries").update(row).eq("id", id).eq("holding_id", holdingId)
      if (error) return { ok: false, message: error.message }
    } else {
      const { error } = await admin.from("fin_entries").insert(row)
      if (error) return { ok: false, message: error.message }
    }
    revalidatePath("/caixa")
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
    revalidatePath("/caixa")
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
    revalidatePath("/caixa")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}

// ──────────────────── Seed de categorias padrão (restaurante) ────────────────
const DEFAULTS: {
  name: string
  kind: "despesa" | "receita"
  icon: string
  subs?: string[]
}[] = [
  { name: "Aluguel", kind: "despesa", icon: "Home" },
  { name: "Impostos", kind: "despesa", icon: "Landmark" },
  { name: "Fornecedores", kind: "despesa", icon: "Truck", subs: ["Carnes", "Bebidas", "Embalagens", "Hortifruti", "Mercearia"] },
  { name: "Folha de Pagamento", kind: "despesa", icon: "Users" },
  { name: "Energia", kind: "despesa", icon: "Zap" },
  { name: "Água", kind: "despesa", icon: "Droplet" },
  { name: "Internet / Telefone", kind: "despesa", icon: "Wifi" },
  { name: "Marketing", kind: "despesa", icon: "Megaphone" },
  { name: "Taxas de Delivery", kind: "despesa", icon: "Bike" },
  { name: "Manutenção", kind: "despesa", icon: "Wrench" },
  { name: "Outras Despesas", kind: "despesa", icon: "MoreHorizontal" },
  { name: "Delivery", kind: "receita", icon: "Bike", subs: ["iFood", "99 Food", "Keeta"] },
  { name: "Salão / Balcão", kind: "receita", icon: "Store" },
  { name: "Outras Receitas", kind: "receita", icon: "Plus" },
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
        .insert({ holding_id: holdingId, name: c.name, kind: c.kind, icon: c.icon, sort_order: order++ })
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
            sort_order: so++,
          })),
        )
      }
    }
    revalidatePath("/caixa")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}
