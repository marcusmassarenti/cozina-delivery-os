"use server"

import { revalidatePath, revalidateTag } from "next/cache"

import { guard, requireSuperadmin } from "@/lib/auth/guards"
import { getCurrentHoldingId } from "@/lib/auth/permissions"

export type CriarClienteState = {
  ok: boolean
  message?: string
  fieldErrors?: Record<string, string>
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos (combining marks)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Provisiona um CLIENTE novo (super-admin only): cria empresa (holding) +
 * marca + 1ª loja + usuário admin vinculado. O admin do cliente entra com
 * is_superadmin=false (vê só a própria empresa). Sem migration — só inserts.
 *
 * Ordem: cria o usuário PRIMEIRO (falha mais comum = e-mail repetido). Se um
 * passo seguinte falhar, faz rollback best-effort (remove o que criou).
 */
export async function criarCliente(
  _prev: CriarClienteState,
  formData: FormData,
): Promise<CriarClienteState> {
  return guard(async () => {
    const { admin } = await requireSuperadmin()

    const empresa = String(formData.get("empresa") ?? "").trim()
    const adminNome = String(formData.get("adminNome") ?? "").trim()
    const adminEmail = String(formData.get("adminEmail") ?? "")
      .trim()
      .toLowerCase()
    const adminSenha = String(formData.get("adminSenha") ?? "")
    const lojaNome = String(formData.get("lojaNome") ?? "").trim()
    const lojaCidade = String(formData.get("lojaCidade") ?? "").trim()
    const lojaUf = String(formData.get("lojaUf") ?? "").trim().toUpperCase()
    const establishmentType =
      String(formData.get("establishmentType") ?? "").trim() || null
    const paymentMethod =
      String(formData.get("paymentMethod") ?? "").trim() || null
    const feeRaw = String(formData.get("monthlyFee") ?? "")
      .replace(/\./g, "")
      .replace(",", ".")
      .trim()
    const monthlyFee =
      feeRaw && !Number.isNaN(Number(feeRaw)) ? Number(feeRaw) : null
    const dueDate = dateOrNull(formData.get("dueDate"))

    const fieldErrors: Record<string, string> = {}
    if (!empresa) fieldErrors.empresa = "Nome da empresa obrigatório"
    if (!adminNome) fieldErrors.adminNome = "Nome do admin obrigatório"
    if (!adminEmail || !adminEmail.includes("@"))
      fieldErrors.adminEmail = "E-mail inválido"
    if (adminSenha.length < 6)
      fieldErrors.adminSenha = "Senha precisa de pelo menos 6 caracteres"
    if (!lojaNome) fieldErrors.lojaNome = "Nome da 1ª loja obrigatório"
    if (lojaUf && lojaUf.length !== 2) fieldErrors.lojaUf = "UF com 2 letras"
    if (Object.keys(fieldErrors).length > 0) {
      return { ok: false, fieldErrors, message: "Corrija os campos destacados." }
    }

    // slug único da holding (append -2, -3… se já existir)
    let slug = slugify(empresa) || "cliente"
    const { data: existing } = await admin
      .from("holdings")
      .select("slug")
      .like("slug", `${slug}%`)
    const taken = new Set((existing ?? []).map((h) => h.slug as string))
    if (taken.has(slug)) {
      let i = 2
      while (taken.has(`${slug}-${i}`)) i++
      slug = `${slug}-${i}`
    }

    // 1) usuário admin primeiro (falha comum: e-mail repetido)
    const { data: created, error: userErr } = await admin.auth.admin.createUser({
      email: adminEmail,
      password: adminSenha,
      email_confirm: true,
      user_metadata: { full_name: adminNome },
    })
    if (userErr || !created?.user) {
      return {
        ok: false,
        message: `Falha ao criar o usuário admin: ${
          userErr?.message ?? "erro desconhecido"
        }`,
      }
    }
    const newUserId = created.user.id

    let holdingId: string | null = null
    let brandId: string | null = null
    try {
      // 2) empresa (holding)
      const { data: holding, error: hErr } = await admin
        .from("holdings")
        .insert({
          name: empresa,
          slug,
          establishment_type: establishmentType,
          payment_method: paymentMethod,
          monthly_fee: monthlyFee,
          due_date: dueDate,
          paid: true,
        })
        .select("id")
        .single()
      if (hErr || !holding) throw new Error(hErr?.message ?? "Falha ao criar empresa")
      holdingId = holding.id

      // 3) marca (mesma identidade da empresa por ora)
      const { data: brand, error: bErr } = await admin
        .from("brands")
        .insert({
          holding_id: holding.id,
          name: empresa,
          slug: slugify(empresa) || "marca",
        })
        .select("id")
        .single()
      if (bErr || !brand) throw new Error(bErr?.message ?? "Falha ao criar marca")
      brandId = brand.id

      // 4) 1ª loja
      const { error: uErr } = await admin.from("units").insert({
        brand_id: brand.id,
        code: "01",
        name: lojaNome,
        city: lojaCidade || null,
        state: lojaUf || null,
        active: true,
      })
      if (uErr) throw new Error(`Falha ao criar a loja: ${uErr.message}`)

      // 5) profile do admin: perfil administrador, NÃO super-admin da plataforma
      const { error: pErr } = await admin.from("profiles").upsert(
        {
          user_id: newUserId,
          full_name: adminNome,
          perfil: "administrador",
          is_superadmin: false,
        },
        { onConflict: "user_id" },
      )
      if (pErr) throw new Error(`Falha no perfil: ${pErr.message}`)

      // 6) vínculo: admin da holding nova
      const { error: aErr } = await admin.from("user_unit_access").insert({
        user_id: newUserId,
        scope_type: "holding",
        scope_id: holding.id,
        role: "admin",
      })
      if (aErr) throw new Error(`Falha no vínculo de acesso: ${aErr.message}`)
    } catch (e) {
      // rollback best-effort (FK é restrict → apaga na ordem filho→pai)
      if (brandId) await admin.from("units").delete().eq("brand_id", brandId)
      if (brandId) await admin.from("brands").delete().eq("id", brandId)
      if (holdingId) await admin.from("holdings").delete().eq("id", holdingId)
      await admin.auth.admin.deleteUser(newUserId)
      return {
        ok: false,
        message: e instanceof Error ? e.message : "Falha ao provisionar o cliente.",
      }
    }

    revalidateTag("units", "max")
    revalidateTag("reports", "max")
    revalidatePath("/plataforma")
    return { ok: true }
  })
}

export type BillingActionState = { ok: boolean; message?: string }

/** Salva o preço POR LOJA dos planos Essencial/Pro do self-service (super-admin). */
export async function setPlatformPlan(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  return guard(async () => {
    const { admin } = await requireSuperadmin()
    const money = (key: string): number | null => {
      const raw = String(formData.get(key) ?? "").replace(/\./g, "").replace(",", ".").trim()
      const n = raw ? Number(raw) : null
      return n != null && !Number.isNaN(n) && n >= 0 ? n : null
    }
    const essencial = money("essencial")
    const pro = money("pro")
    if (essencial == null) return { ok: false, message: "Informe o valor do Essencial (por loja)." }
    if (pro == null) return { ok: false, message: "Informe o valor do Pro (por loja)." }

    const { error } = await admin.from("platform_settings").upsert(
      {
        id: 1,
        essencial_per_unit: essencial,
        pro_per_unit: pro,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    if (error) return { ok: false, message: error.message }

    revalidatePath("/plataforma")
    return { ok: true }
  })
}

function dateOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

/** Salva os dados de cobrança de um cliente (super-admin). */
export async function setClientBilling(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  return guard(async () => {
    const { admin } = await requireSuperadmin()
    const holdingId = String(formData.get("holdingId") ?? "").trim()
    if (!holdingId) return { ok: false, message: "Cliente não identificado." }

    const name = String(formData.get("name") ?? "").trim()
    if (!name) return { ok: false, message: "Nome da empresa é obrigatório." }
    const establishmentType =
      String(formData.get("establishmentType") ?? "").trim() || null
    const paymentMethod =
      String(formData.get("paymentMethod") ?? "").trim() || null
    const money = (key: string): number | null => {
      const raw = String(formData.get(key) ?? "").replace(/\./g, "").replace(",", ".").trim()
      const n = raw ? Number(raw) : null
      return n != null && !Number.isNaN(n) ? n : null
    }
    const monthlyFee = money("monthlyFee")
    const pricePerUnit = money("pricePerUnit")
    const includedRaw = String(formData.get("includedUnits") ?? "").trim()
    const includedUnits =
      includedRaw && !Number.isNaN(Number(includedRaw))
        ? Math.max(0, Math.trunc(Number(includedRaw)))
        : 1
    const dueDate = dateOrNull(formData.get("dueDate"))
    const suspendOn = dateOrNull(formData.get("suspendOn"))
    const paid = formData.get("paid") === "on"

    const { error } = await admin
      .from("holdings")
      .update({
        name,
        establishment_type: establishmentType,
        payment_method: paymentMethod,
        monthly_fee: monthlyFee,
        price_per_unit: pricePerUnit,
        included_units: includedUnits,
        due_date: dueDate,
        paid,
        suspend_on: suspendOn,
      })
      .eq("id", holdingId)
    if (error) return { ok: false, message: error.message }

    revalidatePath("/plataforma")
    revalidatePath("/", "layout")
    return { ok: true }
  })
}

/** Registra um pagamento recebido de um cliente (super-admin). */
export async function recordPayment(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  return guard(async () => {
    const { admin } = await requireSuperadmin()
    const holdingId = String(formData.get("holdingId") ?? "").trim()
    if (!holdingId) return { ok: false, message: "Cliente não identificado." }
    const paidOn = dateOrNull(formData.get("paidOn"))
    if (!paidOn) return { ok: false, message: "Informe a data do pagamento." }
    const amtRaw = String(formData.get("amount") ?? "").replace(/\./g, "").replace(",", ".").trim()
    const amount = amtRaw ? Number(amtRaw) : NaN
    if (Number.isNaN(amount) || amount <= 0) return { ok: false, message: "Informe um valor válido." }

    const { error } = await admin.from("holding_payments").insert({
      holding_id: holdingId,
      paid_on: paidOn,
      amount,
      method: String(formData.get("method") ?? "").trim() || null,
      ref_month: String(formData.get("refMonth") ?? "").trim() || null,
      note: String(formData.get("note") ?? "").trim() || null,
    })
    if (error) return { ok: false, message: error.message }
    revalidatePath("/plataforma")
    return { ok: true }
  })
}

/** Remove um pagamento registrado (super-admin). */
export async function deletePayment(paymentId: string): Promise<BillingActionState> {
  return guard(async () => {
    const { admin } = await requireSuperadmin()
    if (!paymentId) return { ok: false, message: "Pagamento não identificado." }
    const { error } = await admin.from("holding_payments").delete().eq("id", paymentId)
    if (error) return { ok: false, message: error.message }
    revalidatePath("/plataforma")
    return { ok: true }
  })
}

/**
 * Exclui um CLIENTE (holding) inteiro: usuários (auth, cascata profiles +
 * acessos), lojas (cascata dos dados), marcas e a empresa. Só super-admin.
 * Guarda: não deixa excluir a PRÓPRIA empresa do super-admin (evita apagar a
 * Cozina sem querer). Ordem FK-safe: units → brands → users → holding.
 */
export async function deleteClient(
  holdingId: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!holdingId) return { ok: false, message: "Cliente inválido." }
  try {
    const { admin } = await requireSuperadmin()
    const myHolding = await getCurrentHoldingId()
    if (holdingId === myHolding)
      return {
        ok: false,
        message: "Não dá pra excluir a sua própria empresa por aqui.",
      }

    const { data: brandsData } = await admin
      .from("brands")
      .select("id")
      .eq("holding_id", holdingId)
    const brandIds = (brandsData ?? []).map((b) => b.id)

    let unitIds: string[] = []
    if (brandIds.length > 0) {
      const { data: unitsData } = await admin
        .from("units")
        .select("id")
        .in("brand_id", brandIds)
      unitIds = (unitsData ?? []).map((u) => u.id)
    }

    // usuários vinculados à empresa (qualquer escopo que aponte pra ela)
    const scopeIds = [holdingId, ...brandIds, ...unitIds]
    const { data: accessData } = await admin
      .from("user_unit_access")
      .select("user_id")
      .in("scope_id", scopeIds)
    const userIds = [...new Set((accessData ?? []).map((a) => a.user_id))]

    // lojas (cascata dos dados) → marcas → usuários (cascata acessos) → empresa
    if (unitIds.length > 0) {
      const { error } = await admin.from("units").delete().in("id", unitIds)
      if (error)
        return { ok: false, message: `Erro ao excluir as lojas: ${error.message}` }
    }
    if (brandIds.length > 0)
      await admin.from("brands").delete().in("id", brandIds)
    for (const uid of userIds) await admin.auth.admin.deleteUser(uid)
    const { error: hErr } = await admin
      .from("holdings")
      .delete()
      .eq("id", holdingId)
    if (hErr) return { ok: false, message: hErr.message }

    revalidatePath("/plataforma")
    revalidatePath("/", "layout")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro ao excluir cliente.",
    }
  }
}
